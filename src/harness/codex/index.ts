/**
 * Codex harness adapter
 *
 * Spawns `codex exec --json` and parses JSONL output.
 * Maps Codex events to ClaudeEvent-compatible events.
 */

import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import { crossSpawn } from '../../utils/spawn.js';
import type { Capabilities } from '../adapter.js';
import type { StatusLineData } from '../../claude/cli.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('codex');

/**
 * Codex harness capabilities: no interactive approval or advanced features.
 */
export const CODEX_CAPABILITIES: Capabilities = {
  interactiveApproval: false,
  planApproval: false,
  multipleChoice: false,
  compaction: false,
  costEvents: false,
};

/**
 * Options for CodexCli constructor.
 */
export interface CodexCliOptions {
  workingDir: string;
  sessionId?: string;    // for resume
  prompt?: string;       // initial prompt (used in start())
  sandboxMode?: 'read-only' | 'workspace-write' | 'full-access';  // default: 'workspace-write'
}

/**
 * Generic event shape from codex exec --json
 */
interface CodexEvent {
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
 * CodexCli spawns the Codex CLI and manages its subprocess.
 * Implements the HarnessProcess interface for Tandem.
 */
export class CodexCli extends EventEmitter {
  private process: ChildProcess | null = null;
  private options: CodexCliOptions;
  private buffer = '';
  private stderrBuffer = '';
  private permanentFailure = false;
  private permanentFailureReason: string | null = null;
  private running = false;

  constructor(options: CodexCliOptions) {
    super();
    this.options = options;
  }

  /**
   * Start spawns codex exec --json with the appropriate session/prompt args,
   * emits a sandbox banner, and sets up event handlers.
   */
  start(): void {
    if (this.process) throw new Error('Already running');

    this.permanentFailure = false;
    this.permanentFailureReason = null;
    this.buffer = '';
    this.stderrBuffer = '';
    this.running = true;

    // Emit sandbox banner based on sandbox mode
    const sandboxMode = this.options.sandboxMode ?? 'workspace-write';
    const bannerText = sandboxMode === 'read-only'
      ? '⚠️ **Codex session** — running with `--sandbox read-only`. All file operations require explicit approval. No file writes are permitted.'
      : sandboxMode === 'full-access'
        ? '⚠️ **Codex session** — running with `--sandbox full-access`. All operations are permitted without approval.'
        : '⚠️ **Codex session** — running with `--sandbox workspace-write`. No live per-tool approval. All file writes within the workspace are permitted.';

    // Emit banner as assistant text event
    this.emit('event', {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: bannerText }],
      },
    } as ClaudeEvent);

    // Build args for codex exec
    const args = ['exec', '--json'];

    // Add sandbox mode
    if (sandboxMode !== 'workspace-write') {
      args.push('--sandbox', sandboxMode);
    }

    // Add session ID or prompt
    if (this.options.sessionId) {
      args.push(this.options.sessionId);
    } else if (this.options.prompt) {
      args.push(this.options.prompt);
    } else {
      throw new Error('Either sessionId or prompt is required');
    }

    log.debug(`Starting Codex: codex ${args.join(' ')}`);

    this.process = crossSpawn('codex', args, {
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
      log.error(`Codex error: ${err}`);
      this.permanentFailure = true;
      this.permanentFailureReason = `Failed to spawn Codex: ${err.message}`;
      this.emit('error', err);
    });

    this.process.on('exit', (code) => {
      log.debug(`Codex exited with code ${code}`);
      this.running = false;
      this.process = null;
      this.buffer = '';
      if (code !== 0 && code !== null) {
        this.permanentFailure = true;
        if (!this.permanentFailureReason) {
          this.permanentFailureReason = `Codex exited with code ${code}`;
          if (this.stderrBuffer) {
            this.permanentFailureReason += `: ${this.stderrBuffer.slice(0, 200)}`;
          }
        }
      }
      this.emit('exit', code);
    });
  }

  /**
   * Parse JSONL output from codex exec --json.
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
        const event = JSON.parse(trimmed) as CodexEvent;
        this.handleCodexEvent(event);
      } catch (err) {
        log.debug(`Failed to parse JSON: ${err}`);
      }
    }
  }

  /**
   * Map Codex event types to ClaudeEvent-compatible events.
   */
  private handleCodexEvent(event: CodexEvent): void {
    const eventType = event.type as string;

    switch (eventType) {
      case 'thread.started':
      case 'turn.started':
        // Internal events, don't emit
        break;

      case 'turn.completed':
        // Emit a success result event
        this.emit('event', {
          type: 'result',
          subtype: 'success',
          cost_usd: 0,
          duration_ms: 0,
          is_error: false,
          num_turns: 1,
          result: '',
          session_id: this.options.sessionId,
          total_input_tokens: 0,
          total_output_tokens: 0,
        } as ClaudeEvent);
        break;

      case 'turn.failed': {
        // Emit error result, then exit
        const error = (event as { error?: unknown }).error ?? 'Unknown error';
        this.emit('event', {
          type: 'result',
          subtype: 'error_during_generation',
          is_error: true,
          error,
        } as ClaudeEvent);
        this.permanentFailure = true;
        this.permanentFailureReason = `Turn failed: ${error}`;
        this.emit('exit', 1);
        break;
      }

      case 'error': {
        // Set permanent failure and exit
        const error = (event as { error?: unknown }).error ?? 'Unknown error';
        this.permanentFailure = true;
        this.permanentFailureReason = `Codex error: ${error}`;
        this.emit('exit', 1);
        break;
      }

      default: {
        // Handle item.* events
        if (eventType.startsWith('item.')) {
          const itemEvent = event as { item?: { type?: string; role?: string; content?: string; summary?: string } };
          if (itemEvent.item?.type === 'message' && itemEvent.item?.role === 'assistant') {
            const text = itemEvent.item.content;
            if (text) {
              this.emit('event', {
                type: 'assistant',
                message: {
                  role: 'assistant',
                  content: [{ type: 'text', text }],
                },
              } as ClaudeEvent);
            }
          } else if (itemEvent.item) {
            // Best-effort: emit content or summary as assistant text
            const text = itemEvent.item.content || itemEvent.item.summary;
            if (text) {
              this.emit('event', {
                type: 'assistant',
                message: {
                  role: 'assistant',
                  content: [{ type: 'text', text }],
                },
              } as ClaudeEvent);
            }
          }
        }
        break;
      }
    }
  }

  /**
   * Send a message to the Codex process via stdin.
   * For resume: runs `codex exec resume --last <text>`.
   * For new prompts: starts a new subprocess.
   */
  sendMessage(text: string): void {
    if (this.options.sessionId && !this.process) {
      // Resume mode: spawn a new process with resume
      this.permanentFailure = false;
      this.permanentFailureReason = null;
      this.buffer = '';
      this.stderrBuffer = '';
      this.running = true;

      const args = ['exec', 'resume', '--last', text];
      const sandboxMode = this.options.sandboxMode ?? 'workspace-write';
      if (sandboxMode !== 'workspace-write') {
        args.push('--sandbox', sandboxMode);
      }
      args.push(this.options.sessionId);

      log.debug(`Resuming Codex: codex ${args.join(' ')}`);

      this.process = crossSpawn('codex', args, {
        cwd: this.options.workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Set up event handlers (same as start())
      this.process.stdout?.on('data', (chunk: Buffer) => {
        this.parseOutput(chunk.toString());
      });

      this.process.stderr?.on('data', (chunk: Buffer) => {
        const t = chunk.toString();
        this.stderrBuffer += t;
        if (this.stderrBuffer.length > 10240) {
          this.stderrBuffer = this.stderrBuffer.slice(-10240);
        }
        log.debug(`stderr: ${t.trim()}`);
      });

      this.process.on('error', (err) => {
        log.error(`Codex error: ${err}`);
        this.permanentFailure = true;
        this.permanentFailureReason = `Failed to spawn Codex: ${err.message}`;
        this.emit('error', err);
      });

      this.process.on('exit', (code) => {
        log.debug(`Codex exited with code ${code}`);
        this.running = false;
        this.process = null;
        this.buffer = '';
        if (code !== 0 && code !== null) {
          this.permanentFailure = true;
          if (!this.permanentFailureReason) {
            this.permanentFailureReason = `Codex exited with code ${code}`;
            if (this.stderrBuffer) {
              this.permanentFailureReason += `: ${this.stderrBuffer.slice(0, 200)}`;
            }
          }
        }
        this.emit('exit', code);
      });
    } else if (this.process?.stdin) {
      // Active process: send message via stdin
      const msg = text + '\n';
      log.debug(`Sending to Codex: ${text.substring(0, 50)}...`);
      this.process.stdin.write(msg);
    } else {
      throw new Error('Not running and no session ID for resume');
    }
  }

  /**
   * Check if the process is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Kill the Codex process.
   */
  async kill(): Promise<void> {
    if (!this.process) {
      log.debug('Kill called but process not running');
      return;
    }

    const proc = this.process;
    this.process = null;
    this.running = false;

    log.debug(`Killing Codex process (pid=${proc.pid})`);

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
   * Codex has no status line, always return null.
   */
  getStatusData(): StatusLineData | null {
    return null;
  }
}
