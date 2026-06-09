/**
 * Unit tests for the OpenCode harness adapter SSE event parsing.
 *
 * OpenCodeCli's SSE handling lives in handleSSEEvent (private). We call it
 * via a cast — same pattern used in other adapter tests.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { OpenCodeCli } from './index.js';

// ---------------------------------------------------------------------------
// Helper: call the private handleSSEEvent directly
// ---------------------------------------------------------------------------
type AnyOpenCodeCli = {
  handleSSEEvent: (evt: unknown) => void;
  waitingForIdle: boolean;
  sessionId: string | null;
};

function feedSSE(cli: OpenCodeCli, type: string, properties: Record<string, unknown>): void {
  (cli as unknown as AnyOpenCodeCli).handleSSEEvent({ id: 'evt-1', type, properties });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OpenCodeCli SSE event parsing', () => {
  let cli: OpenCodeCli;
  let emitted: Array<Record<string, unknown>>;

  beforeEach(() => {
    cli = new OpenCodeCli({ workingDir: '/tmp' });
    emitted = [];
    cli.on('event', (evt: Record<string, unknown>) => emitted.push(evt));
  });

  // -------------------------------------------------------------------------
  // Text content
  // -------------------------------------------------------------------------

  test('message.part.updated with text part → emits assistant text event', () => {
    feedSSE(cli, 'message.part.updated', {
      part: { type: 'text', text: 'Hello from OpenCode!' },
    });

    expect(emitted).toHaveLength(1);
    const evt = emitted[0];
    expect(evt.type).toBe('assistant');
    const message = evt.message as { role: string; content: Array<{ type: string; text: string }> };
    expect(message.role).toBe('assistant');
    expect(message.content[0].type).toBe('text');
    expect(message.content[0].text).toBe('Hello from OpenCode!');
  });

  test('message.part.updated with tool part (running) → emits assistant text with tool label', () => {
    feedSSE(cli, 'message.part.updated', {
      part: {
        type: 'tool',
        tool: 'bash',
        state: { status: 'running', title: 'ls -la' },
      },
    });

    expect(emitted).toHaveLength(1);
    const evt = emitted[0];
    expect(evt.type).toBe('assistant');
    const message = evt.message as { content: Array<{ text: string }> };
    expect(message.content[0].text).toContain('bash');
  });

  test('message.part.updated with tool part (completed) → no emission (not running/pending)', () => {
    feedSSE(cli, 'message.part.updated', {
      part: {
        type: 'tool',
        tool: 'read_file',
        state: { status: 'completed' },
      },
    });

    expect(emitted).toHaveLength(0);
  });

  test('message.part.updated with empty text → no emission', () => {
    feedSSE(cli, 'message.part.updated', {
      part: { type: 'text', text: '' },
    });

    expect(emitted).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // session.status → result
  // -------------------------------------------------------------------------

  test('session.status idle while waitingForIdle → emits success result', () => {
    // Set waitingForIdle flag (normally set by sendMessage)
    (cli as unknown as AnyOpenCodeCli).waitingForIdle = true;

    feedSSE(cli, 'session.status', { status: { type: 'idle' } });

    expect(emitted).toHaveLength(1);
    const evt = emitted[0];
    expect(evt.type).toBe('result');
    expect(evt.is_error).toBe(false);
    expect(evt.subtype).toBe('success');
  });

  test('session.status idle when NOT waitingForIdle → no emission', () => {
    // waitingForIdle defaults to false
    feedSSE(cli, 'session.status', { status: { type: 'idle' } });

    expect(emitted).toHaveLength(0);
  });

  test('session.status retry → emits retry info text', () => {
    feedSSE(cli, 'session.status', {
      status: { type: 'retry', attempt: 2, message: 'rate limited' },
    });

    expect(emitted).toHaveLength(1);
    const evt = emitted[0];
    expect(evt.type).toBe('assistant');
    const message = evt.message as { content: Array<{ text: string }> };
    expect(message.content[0].text).toContain('Retrying');
  });

  // -------------------------------------------------------------------------
  // session.error → permanent failure
  // -------------------------------------------------------------------------

  test('session.error → emits error result and sets isPermanentFailure', () => {
    const exitCodes: Array<number | null> = [];
    cli.on('exit', (code: number | null) => exitCodes.push(code));

    feedSSE(cli, 'session.error', {
      error: { name: 'RateLimitError', data: { message: 'Too many requests' } },
    });

    expect(emitted).toHaveLength(1);
    const evt = emitted[0];
    expect(evt.type).toBe('result');
    expect(evt.is_error).toBe(true);
    expect(cli.isPermanentFailure()).toBe(true);
    expect(cli.getPermanentFailureReason()).toContain('Too many requests');
    expect(exitCodes).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // permission.updated
  // -------------------------------------------------------------------------

  test('permission.updated → emits permission_request and tool_use events', () => {
    const permRequests: Array<Record<string, unknown>> = [];
    cli.on('permission_request', (p: Record<string, unknown>) => permRequests.push(p));

    feedSSE(cli, 'permission.updated', {
      id: 'perm-42',
      sessionID: 'sess-1',
      title: 'Run bash command',
      type: 'bash',
      metadata: { command: 'rm -rf /' },
      time: { created: Date.now() },
    });

    expect(permRequests).toHaveLength(1);
    expect(permRequests[0].permissionID).toBe('perm-42');
    expect(permRequests[0].tool).toBe('bash');

    // Also emitted as tool_use
    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe('tool_use');
    expect(emitted[0].id).toBe('perm-42');
  });

  // -------------------------------------------------------------------------
  // session.idle (alternate idle signal)
  // -------------------------------------------------------------------------

  test('session.idle while waitingForIdle → emits success result', () => {
    (cli as unknown as AnyOpenCodeCli).waitingForIdle = true;

    feedSSE(cli, 'session.idle', {});

    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe('result');
    expect(emitted[0].is_error).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Noise / ignored events
  // -------------------------------------------------------------------------

  test('server.connected → no emission', () => {
    feedSSE(cli, 'server.connected', {});
    expect(emitted).toHaveLength(0);
  });

  test('server.heartbeat → no emission', () => {
    feedSSE(cli, 'server.heartbeat', {});
    expect(emitted).toHaveLength(0);
  });

  test('unknown event type → no emission', () => {
    feedSSE(cli, 'session.updated', { foo: 'bar' });
    expect(emitted).toHaveLength(0);
  });
});
