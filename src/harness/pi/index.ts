/**
 * Pi harness adapter
 *
 * Spawns `pi --mode rpc` and parses JSONL output.
 * Maps Pi RPC events to ClaudeEvent-compatible events.
 */

import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import { crossSpawn } from '../../utils/spawn.js';
import type { Capabilities } from '../adapter.js';
import type { StatusLineData } from '../../claude/cli.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('pi');

/**
 * Pi harness capabilities: no interactive approval or advanced features.
 */
export const PI_CAPABILITIES: Capabilities = {
  interactiveApproval: false,
  planApproval: false,
  multipleChoice: false,
  compaction: false,
  costEvents: false,
};

/**
 * Options for PiCli constructor.
 */
export interface PiCliOptions {
  workingDir: string;
  prompt?: string; // initial prompt (used in start())
}

/**
 * Generic event shape from pi --mode rpc
 */
interface PiEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * ClaudeEvent shape — generic event that can be emitted
 */
interface ClaudeEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * PiCli spawns the Pi CLI in RPC mode and manages its subprocess.
 * Implements the HarnessProcess interface for Tandem.
 */
export class PiCli extends EventEmitter {
  private process: ChildProcess | null = null;
  private options: PiCliOptions;
  private buffer = '';
  private stderrBuffer = '';
  private permanentFailure = false;
  private permanentFailureReason: string | null = null;
  private running = false;

  constructor(options: PiCliOptions) {
    super();
    this.options = options;
  }

  /**
   * Start spawns pi --mode rpc with the initial prompt,
   * and sets up event handlers.
   */
  start(): void {
    if (this.process) throw new Error('Already running');

    this.permanentFailure = false;
    this.permanentFailureReason = null;
    this.buffer = '';
    this.stderrBuffer = '';
    this.running = true;

    // Build args for pi
    const args = ['--mode', 'rpc', '--no-session'];

    log.debug(`Starting Pi: pi ${args.join(' ')}`);

    this.process = crossSpawn('pi', args, {
      cwd: this.options.workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout?.on('data', (chunk: Buffer) => {
      this.parseOutput(chunk.toString());
    });

    this.process.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      this.stderrBuffer += text;
      if (this.stderrBuffer.length > 10240) {
        this.stderrBuffer = this.stderrBuffer.slice(-10240);
      }
      log.debug(`stderr: ${text.trim()}`);
    });

    this.process.on('error', (err) => {
      log.error(`Pi error: ${err}`);
      this.permanentFailure = true;
      this.permanentFailureReason = `Failed to spawn Pi: ${err.message}`;
      this.emit('error', err);
    });

    this.process.on('exit', (code) => {
      log.debug(`Pi exited with code ${code}`);
      this.running = false;
      this.process = null;
      this.buffer = '';
      if (code !== 0 && code !== null) {
        this.permanentFailure = true;
        if (!this.permanentFailureReason) {
          this.permanentFailureReason = `Pi exited with code ${code}`;
          if (this.stderrBuffer) {
            this.permanentFailureReason += `: ${this.stderrBuffer.slice(0, 200)}`;
          }
        }
      }
      this.emit('exit', code);
    });

    // Send initial prompt if provided
    if (this.options.prompt && this.process?.stdin) {
      this.sendMessage(this.options.prompt);
    }
  }

  /**
   * Parse JSONL output from pi --mode rpc.
   * Each line is a JSON event.
   */
  private parseOutput(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const event = JSON.parse(trimmed) as PiEvent;
        this.handlePiEvent(event);
      } catch (err) {
        log.debug(`Failed to parse JSON: ${err}`);
      }
    }
  }

  /**
   * Map Pi RPC event types to ClaudeEvent-compatible events.
   */
  private handlePiEvent(event: PiEvent): void {
    const eventType = event.type as string;

    switch (eventType) {
      // UI request events (ignored - Pi internal UI updates)
      case 'extension_ui_request':
        // Internal Pi UI updates - skip
        break;

      // Content delta events
      case 'content_block_delta': {
        // Handle streaming text content
        const deltaEvent = event as { delta?: { type?: string; text?: string } };
        if (deltaEvent.delta?.type === 'text_delta' && deltaEvent.delta?.text) {
          this.emit('event', {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: deltaEvent.delta.text }],
            },
          } as ClaudeEvent);
        }
        break;
      }

      case 'text_delta': {
        // Alternative text delta format
        const deltaEvent = event as { text?: string };
        if (deltaEvent.text) {
          this.emit('event', {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: deltaEvent.text }],
            },
          } as ClaudeEvent);
        }
        break;
      }

      // Tool use events
      case 'tool_use':
      case 'tool_call': {
        // Format tool use as assistant text describing the tool
        const toolEvent = event as { id?: string; name?: string; input?: unknown };
        const toolName = toolEvent.name || 'unknown_tool';
        const toolText = `[Tool: ${toolName}]`;
        this.emit('event', {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: toolText }],
          },
        } as ClaudeEvent);
        break;
      }

      // Message completion / done event
      case 'message_stop':
      case 'message_delta':
      case 'message_start': {
        // Completion events - emit success result
        this.emit('event', {
          type: 'result',
          subtype: 'success',
          cost_usd: 0,
          duration_ms: 0,
          is_error: false,
          num_turns: 1,
          result: '',
          total_input_tokens: 0,
          total_output_tokens: 0,
        } as ClaudeEvent);
        break;
      }

      // Error events
      case 'error': {
        const errorEvent = event as { error?: unknown };
        const error = errorEvent.error ?? 'Unknown error';
        this.emit('event', {
          type: 'result',
          subtype: 'error_during_generation',
          is_error: true,
          error,
        } as ClaudeEvent);
        this.permanentFailure = true;
        this.permanentFailureReason = `Pi error: ${error}`;
        this.emit('exit', 1);
        break;
      }

      // RPC response with success: false indicates an error
      case 'response': {
        const responseEvent = event as {
          success?: boolean;
          error?: string;
        };
        if (responseEvent.success === false) {
          const error = responseEvent.error ?? 'Unknown error';
          log.debug(`Pi RPC error: ${error}`);
          // Don't immediately fail on RPC error - might be recoverable
        }
        break;
      }

      default:
        // Ignore unknown events
        break;
    }
  }

  /**
   * Send a message to the Pi process via stdin.
   */
  sendMessage(text: string): void {
    if (!this.process?.stdin) {
      throw new Error('Not running');
    }

    // Send as JSON RPC message
    const msg = JSON.stringify({
      type: 'message',
      content: text,
    }) + '\n';

    log.debug(`Sending to Pi: ${text.substring(0, 50)}...`);
    this.process.stdin.write(msg);
  }

  /**
   * Check if the process is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Kill the Pi process.
   */
  async kill(): Promise<void> {
    if (!this.process) {
      log.debug('Kill called but process not running');
      return;
    }

    const proc = this.process;
    this.process = null;
    this.running = false;

    log.debug(`Killing Pi process (pid=${proc.pid})`);

    return new Promise<void>((resolve) => {
      // Send SIGINT
      proc.kill('SIGINT');

      // Send SIGTERM after timeout
      const timeout = setTimeout(() => {
        try {
          proc.kill('SIGTERM');
        } catch {
          // Process may have already exited
        }
      }, 2000);

      // Wait for exit
      proc.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      // Resolve after a reasonable timeout even if exit never fires
      setTimeout(() => {
        clearTimeout(timeout);
        resolve();
      }, 5000);
    });
  }

  /**
   * Check if the last failure was permanent (shouldn't be retried).
   */
  isPermanentFailure(): boolean {
    return this.permanentFailure;
  }

  /**
   * Get a human-readable description of a permanent failure.
   */
  getPermanentFailureReason(): string | null {
    return this.permanentFailureReason;
  }

  /**
   * Send SIGINT to the process (interrupt).
   */
  interrupt(): boolean {
    if (!this.process) return false;
    try {
      this.process.kill('SIGINT');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Pi has no status line, always return null.
   */
  getStatusData(): StatusLineData | null {
    return null;
  }
}
