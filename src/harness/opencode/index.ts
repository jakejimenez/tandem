/**
 * OpenCode harness adapter
 *
 * Spawns `opencode serve --port <port>` as an HTTP server, connects via REST
 * and SSE, creates a session, and streams events as ClaudeEvent-compatible
 * emissions. Permissions are handled via the REST endpoint.
 *
 * API shape (opencode 1.15.x):
 *   POST   /session                         → create session → {id, ...}
 *   POST   /session/{id}/message            → send message (async, events on SSE)
 *   POST   /session/{id}/abort              → abort / interrupt
 *   POST   /session/{id}/permissions/{pid}  → {response: "once"|"always"|"reject"}
 *   GET    /event                           → SSE stream, each line: data: {id, type, properties}
 *
 * SSE event types of interest:
 *   server.connected          – server ready
 *   message.part.updated      – streaming text/tool content parts
 *   session.status            – {type:"idle"} = turn complete; {type:"busy"} = in progress
 *   permission.updated        – permission request from agent
 *   session.error             – fatal session error
 */

import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import { crossSpawn } from '../../utils/spawn.js';
import type { Capabilities } from '../adapter.js';
import type { StatusLineData } from '../../claude/cli.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('opencode');

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

/**
 * OpenCode harness capabilities.
 *
 * interactiveApproval is true because we wire permission events to the REST
 * endpoint `POST /session/{id}/permissions/{permissionID}`.
 */
export const OPENCODE_CAPABILITIES: Capabilities = {
  interactiveApproval: true,
  planApproval: false,
  multipleChoice: false,
  compaction: false,
  costEvents: false,
};

// ---------------------------------------------------------------------------
// Types mirroring the opencode SDK (subset used here)
// ---------------------------------------------------------------------------

interface OpenCodeSSEEvent {
  id: string;
  type: string;
  properties: Record<string, unknown>;
}

interface TextPart {
  type: 'text';
  text: string;
  messageID?: string;
}

interface ToolPart {
  type: 'tool';
  tool: string;
  state?: {
    status: string;
    input?: Record<string, unknown>;
    title?: string;
  };
}

type MessagePart = TextPart | ToolPart | { type: string; [key: string]: unknown };

interface PermissionProperties {
  id: string;
  sessionID: string;
  title: string;
  type: string;
  metadata: Record<string, unknown>;
  callID?: string;
  pattern?: string | string[];
  time: { created: number };
}

interface SessionStatus {
  type: 'idle' | 'busy' | 'retry';
  attempt?: number;
  message?: string;
}

interface SessionError {
  name: string;
  data: { message?: string };
}

// ---------------------------------------------------------------------------
// ClaudeEvent shape emitted on 'event'
// ---------------------------------------------------------------------------

interface ClaudeEvent {
  type: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface OpenCodeCliOptions {
  /** Directory to run opencode in (sets the CWD for the server process) */
  workingDir: string;
  /** Optional port override; defaults to a random high port (0 = OS assigns) */
  port?: number;
  /** Initial prompt to send when start() is called */
  prompt?: string;
  /** Milliseconds to wait for the server to become ready */
  readyTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Pending permission helper
// ---------------------------------------------------------------------------

interface PendingPermission {
  permissionID: string;
  title: string;
  tool: string;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Main adapter class
// ---------------------------------------------------------------------------

/**
 * OpenCodeCli manages an `opencode serve` subprocess and communicates with it
 * via HTTP REST + SSE.  Implements the HarnessProcess interface.
 */
export class OpenCodeCli extends EventEmitter {
  private process: ChildProcess | null = null;
  private options: OpenCodeCliOptions;

  /** Resolved base URL of the running server, e.g. "http://127.0.0.1:4321" */
  private serverUrl: string | null = null;

  /** Session ID returned by POST /session */
  private sessionId: string | null = null;

  /** SSE AbortController so we can cancel the stream cleanly */
  private sseAbortController: AbortController | null = null;

  /** Whether the server process is alive */
  private running = false;

  /** Permanent failure state */
  private permanentFailure = false;
  private permanentFailureReason: string | null = null;

  /** Pending permissions waiting for respondToPermission() */
  private pendingPermissions = new Map<string, PendingPermission>();

  /**
   * Track whether we have received at least one idle event for the current
   * turn so we know when to emit the result event.
   */
  private waitingForIdle = false;

  constructor(options: OpenCodeCliOptions) {
    super();
    this.options = options;
  }

  // -------------------------------------------------------------------------
  // Public HarnessProcess interface
  // -------------------------------------------------------------------------

  /**
   * Spawn opencode serve, wait for it to be ready, create a session, and
   * subscribe to the SSE event stream.
   */
  async start(): Promise<void> {
    if (this.process) throw new Error('Already running');

    this.permanentFailure = false;
    this.permanentFailureReason = null;
    this.running = true;

    // Pick a port; 0 means OS will assign — but we need to know the actual
    // port from the server's startup line.
    const desiredPort = this.options.port ?? 0;

    log.debug(`Starting opencode serve on port=${desiredPort}`);

    this.process = crossSpawn('opencode', ['serve', '--port', String(desiredPort)], {
      cwd: this.options.workingDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.process.on('error', (err) => {
      log.error(`opencode serve error: ${err}`);
      this.permanentFailure = true;
      this.permanentFailureReason = `Failed to spawn opencode serve: ${err.message}`;
      this.running = false;
      this.emit('error', err);
    });

    this.process.on('exit', (code) => {
      log.debug(`opencode serve exited with code ${code}`);
      this.running = false;
      this.process = null;
      this.sseAbortController?.abort();
      if (code !== 0 && code !== null && !this.permanentFailure) {
        this.permanentFailure = true;
        this.permanentFailureReason = `opencode serve exited with code ${code}`;
      }
      this.emit('exit', code);
    });

    // Wait for the server to print its URL to stderr/stdout
    this.serverUrl = await this.waitForServerReady();

    log.debug(`opencode server ready at ${this.serverUrl}`);

    // Emit a banner so users know they're in an opencode session
    this.emit('event', {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{
          type: 'text',
          text: '⚠️ **OpenCode session** — running via `opencode serve`. Tool permissions require approval.',
        }],
      },
    } as ClaudeEvent);

    // Create the session
    this.sessionId = await this.createSession();
    log.debug(`opencode session created: ${this.sessionId}`);

    // Subscribe to SSE stream
    this.subscribeToSSE();

    // If there's an initial prompt, send it
    if (this.options.prompt) {
      this.sendMessage(this.options.prompt);
    }
  }

  /**
   * Send a message to the current session.
   */
  sendMessage(text: string): void {
    if (!this.serverUrl || !this.sessionId) {
      throw new Error('OpenCode server not started — call start() first');
    }

    this.waitingForIdle = true;

    const url = `${this.serverUrl}/session/${this.sessionId}/message`;
    const body = JSON.stringify({
      parts: [{ type: 'text', text }],
    });

    log.debug(`sendMessage to ${url}: ${text.substring(0, 80)}...`);

    // Fire-and-forget; we rely on SSE events for the response
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).then(async (res) => {
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        log.error(`sendMessage HTTP ${res.status}: ${errText}`);
      }
    }).catch((err: unknown) => {
      log.error(`sendMessage fetch error: ${err}`);
    });
  }

  /**
   * Respond to a pending permission request.
   *
   * @param permissionID - the ID from the permission.updated event
   * @param response     - "once" | "always" | "reject"
   */
  async respondToPermission(
    permissionID: string,
    response: 'once' | 'always' | 'reject',
  ): Promise<void> {
    if (!this.serverUrl || !this.sessionId) return;

    const url = `${this.serverUrl}/session/${this.sessionId}/permissions/${permissionID}`;
    log.debug(`respondToPermission ${permissionID} → ${response}`);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        log.error(`respondToPermission HTTP ${res.status}: ${errText}`);
      }
    } catch (err) {
      log.error(`respondToPermission fetch error: ${err}`);
    }

    this.pendingPermissions.delete(permissionID);
  }

  /**
   * Returns true when the server process is alive.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Kill the server process and cancel the SSE stream.
   */
  async kill(): Promise<void> {
    if (!this.process) {
      log.debug('kill() called but process not running');
      return;
    }

    this.sseAbortController?.abort();

    const proc = this.process;
    this.process = null;
    this.running = false;

    log.debug(`Killing opencode serve (pid=${proc.pid})`);

    return new Promise<void>((resolve) => {
      proc.kill('SIGINT');

      const sigterm = setTimeout(() => {
        try { proc.kill('SIGTERM'); } catch { /* already dead */ }
      }, 2000);

      proc.on('exit', () => {
        clearTimeout(sigterm);
        resolve();
      });

      setTimeout(() => {
        clearTimeout(sigterm);
        resolve();
      }, 5000);
    });
  }

  /**
   * Abort the current session turn (equivalent to Ctrl-C in the TUI).
   */
  interrupt(): boolean {
    if (!this.serverUrl || !this.sessionId) return false;

    const url = `${this.serverUrl}/session/${this.sessionId}/abort`;
    log.debug(`interrupt(): POST ${url}`);

    fetch(url, { method: 'POST' }).catch((err: unknown) => {
      log.debug(`interrupt fetch error: ${err}`);
    });

    return true;
  }

  isPermanentFailure(): boolean {
    return this.permanentFailure;
  }

  getPermanentFailureReason(): string | null {
    return this.permanentFailureReason;
  }

  /** OpenCode has no status-line file; always return null. */
  getStatusData(): StatusLineData | null {
    return null;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Read stdout/stderr until we see the "opencode server listening on http://..."
   * line, then return the base URL.
   */
  private waitForServerReady(): Promise<string> {
    const timeoutMs = this.options.readyTimeoutMs ?? 15_000;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timed out waiting for opencode server to start'));
      }, timeoutMs);

      const onData = (chunk: Buffer) => {
        const text = chunk.toString();
        log.debug(`opencode stderr: ${text.trim()}`);

        // The server prints: "opencode server listening on http://127.0.0.1:PORT"
        const match = text.match(/opencode server listening on (https?:\/\/\S+)/);
        if (match) {
          clearTimeout(timer);
          this.process?.stdout?.off('data', onData);
          this.process?.stderr?.off('data', onData);
          resolve(match[1].trim());
        }
      };

      this.process?.stdout?.on('data', onData);
      this.process?.stderr?.on('data', onData);

      this.process?.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`opencode serve exited early with code ${code}`));
      });
    });
  }

  /** Create a new session via POST /session */
  private async createSession(): Promise<string> {
    const url = `${this.serverUrl}/session`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`POST /session failed HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json() as { id: string };
    return data.id;
  }

  /**
   * Subscribe to the SSE event stream at GET /event.
   * Uses Node's native fetch (available in Bun/Node 18+) and reads the
   * response body as a text stream.
   */
  private subscribeToSSE(): void {
    if (!this.serverUrl) return;

    this.sseAbortController = new AbortController();
    const { signal } = this.sseAbortController;

    const sseUrl = `${this.serverUrl}/event`;
    log.debug(`Subscribing to SSE at ${sseUrl}`);

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      try {
        const res = await fetch(sseUrl, {
          headers: { Accept: 'text/event-stream' },
          signal,
        });

        if (!res.ok) {
          throw new Error(`GET /event returned HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body from SSE endpoint');

        const decoder = new TextDecoder();
        let lineBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          lineBuffer += decoder.decode(value, { stream: true });
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;

            const jsonStr = trimmed.slice('data:'.length).trim();
            if (!jsonStr) continue;

            try {
              const evt = JSON.parse(jsonStr) as OpenCodeSSEEvent;
              this.handleSSEEvent(evt);
            } catch (parseErr) {
              log.debug(`SSE JSON parse error: ${parseErr}`);
            }
          }
        }
      } catch (err: unknown) {
        if (signal.aborted) return; // normal shutdown
        log.error(`SSE stream error: ${err}`);
        if (!this.permanentFailure) {
          this.permanentFailure = true;
          this.permanentFailureReason = `SSE stream failed: ${err}`;
        }
        this.emit('exit', 1);
      }
    })();
  }

  /**
   * Map an opencode SSE event to one or more ClaudeEvent emissions.
   */
  private handleSSEEvent(evt: OpenCodeSSEEvent): void {
    log.debug(`SSE event: ${evt.type}`);

    switch (evt.type) {
      case 'server.connected':
        // Server acknowledged our SSE connection
        break;

      case 'server.heartbeat':
        // Keep-alive ping; ignore
        break;

      case 'message.part.updated': {
        const props = evt.properties as { part?: MessagePart; delta?: string };
        const part = props.part;
        if (!part) break;

        if (part.type === 'text') {
          const textPart = part as TextPart;
          // Only emit if the part belongs to the current session message
          if (textPart.text) {
            this.emit('event', {
              type: 'assistant',
              message: {
                role: 'assistant',
                content: [{ type: 'text', text: textPart.text }],
              },
            } as ClaudeEvent);
          }
        } else if (part.type === 'tool') {
          const toolPart = part as ToolPart;
          const toolName = toolPart.tool ?? 'unknown_tool';
          const status = toolPart.state?.status ?? '';
          const title = toolPart.state?.title ?? '';

          // Emit a descriptive assistant text so Slack can show tool activity
          if (status === 'running' || status === 'pending') {
            const label = title ? `${toolName}: ${title}` : toolName;
            this.emit('event', {
              type: 'assistant',
              message: {
                role: 'assistant',
                content: [{ type: 'text', text: `🔧 Running: ${label}` }],
              },
            } as ClaudeEvent);
          }
        }
        break;
      }

      case 'permission.updated': {
        // A tool is requesting permission.
        const perm = evt.properties as unknown as PermissionProperties;
        if (!perm.id) break;

        const pending: PendingPermission = {
          permissionID: perm.id,
          title: perm.title ?? perm.type,
          tool: perm.type,
          metadata: perm.metadata ?? {},
        };
        this.pendingPermissions.set(perm.id, pending);

        log.debug(`Permission request: ${perm.id} — ${perm.title}`);

        // Emit as a 'permission_request' event so the session layer can
        // present thumbs-up/thumbs-down and call respondToPermission().
        this.emit('permission_request', {
          permissionID: perm.id,
          title: perm.title,
          tool: perm.type,
          metadata: perm.metadata,
          sessionID: perm.sessionID,
        });

        // Also emit as tool_use so the existing approval flow picks it up
        this.emit('event', {
          type: 'tool_use',
          id: perm.id,
          name: perm.type,
          input: perm.metadata ?? {},
        } as ClaudeEvent);
        break;
      }

      case 'session.status': {
        const props = evt.properties as { sessionID?: string; status?: SessionStatus };
        const status = props.status;
        if (!status) break;

        if (status.type === 'idle' && this.waitingForIdle) {
          this.waitingForIdle = false;

          // Turn complete — emit a success result event
          this.emit('event', {
            type: 'result',
            subtype: 'success',
            cost_usd: 0,
            duration_ms: 0,
            is_error: false,
            num_turns: 1,
            result: '',
            session_id: this.sessionId,
            total_input_tokens: 0,
            total_output_tokens: 0,
          } as ClaudeEvent);
        } else if (status.type === 'retry') {
          log.debug(`session retry attempt=${status.attempt}: ${status.message}`);
          // Emit informational text so the user sees retry activity
          this.emit('event', {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{
                type: 'text',
                text: `⏳ Retrying (attempt ${status.attempt ?? '?'}): ${status.message ?? ''}`,
              }],
            },
          } as ClaudeEvent);
        }
        break;
      }

      case 'session.error': {
        const props = evt.properties as { error?: SessionError };
        const errMsg = props.error?.data?.message ?? props.error?.name ?? 'Unknown session error';
        log.error(`session.error: ${errMsg}`);

        this.emit('event', {
          type: 'result',
          subtype: 'error_during_generation',
          is_error: true,
          error: errMsg,
        } as ClaudeEvent);

        this.permanentFailure = true;
        this.permanentFailureReason = `Session error: ${errMsg}`;
        this.emit('exit', 1);
        break;
      }

      case 'session.idle': {
        // Alternative idle signal (some builds emit this instead of session.status idle)
        if (this.waitingForIdle) {
          this.waitingForIdle = false;
          this.emit('event', {
            type: 'result',
            subtype: 'success',
            cost_usd: 0,
            duration_ms: 0,
            is_error: false,
            num_turns: 1,
            result: '',
            session_id: this.sessionId,
            total_input_tokens: 0,
            total_output_tokens: 0,
          } as ClaudeEvent);
        }
        break;
      }

      default:
        // All other events (session.updated, message.updated, file.edited,
        // session.diff, etc.) are silently ignored.
        break;
    }
  }
}
