/**
 * Unit tests for the Pi harness adapter event parsing.
 *
 * Drives the private parseOutput / handlePiEvent logic without spawning
 * a subprocess, using the same cast pattern as other adapter tests.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { PiCli } from './index.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
type AnyPiCli = {
  parseOutput: (data: string) => void;
};

function feedLine(cli: PiCli, jsonLine: string): void {
  (cli as unknown as AnyPiCli).parseOutput(jsonLine + '\n');
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_TEXT_DELTA = JSON.stringify({
  type: 'text_delta',
  text: 'Hello from Pi!',
});

const FIXTURE_CONTENT_BLOCK_DELTA = JSON.stringify({
  type: 'content_block_delta',
  delta: { type: 'text_delta', text: 'Streaming text.' },
});

const FIXTURE_MESSAGE_STOP = JSON.stringify({ type: 'message_stop' });

const FIXTURE_TOOL_USE = JSON.stringify({
  type: 'tool_use',
  id: 'tool-1',
  name: 'bash',
  input: { command: 'ls' },
});

const FIXTURE_TOOL_CALL = JSON.stringify({
  type: 'tool_call',
  id: 'tool-2',
  name: 'read_file',
  input: { path: '/tmp/foo.txt' },
});

const FIXTURE_ERROR = JSON.stringify({
  type: 'error',
  error: 'Pi agent crashed',
});

const FIXTURE_MESSAGE_START = JSON.stringify({ type: 'message_start' });
const FIXTURE_MESSAGE_DELTA = JSON.stringify({ type: 'message_delta' });

const FIXTURE_EXTENSION_UI = JSON.stringify({ type: 'extension_ui_request', data: {} });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PiCli event parsing', () => {
  let cli: PiCli;
  let emitted: Array<Record<string, unknown>>;

  beforeEach(() => {
    cli = new PiCli({ workingDir: '/tmp' });
    emitted = [];
    cli.on('event', (evt: Record<string, unknown>) => emitted.push(evt));
  });

  test('text_delta → emits assistant text event', () => {
    feedLine(cli, FIXTURE_TEXT_DELTA);

    expect(emitted).toHaveLength(1);
    const evt = emitted[0];
    expect(evt.type).toBe('assistant');
    const message = evt.message as { role: string; content: Array<{ type: string; text: string }> };
    expect(message.role).toBe('assistant');
    expect(message.content[0].text).toBe('Hello from Pi!');
  });

  test('content_block_delta with text_delta → emits assistant text event', () => {
    feedLine(cli, FIXTURE_CONTENT_BLOCK_DELTA);

    expect(emitted).toHaveLength(1);
    const evt = emitted[0];
    expect(evt.type).toBe('assistant');
    const message = evt.message as { content: Array<{ text: string }> };
    expect(message.content[0].text).toBe('Streaming text.');
  });

  test('message_stop → emits result event with is_error: false', () => {
    feedLine(cli, FIXTURE_MESSAGE_STOP);

    expect(emitted).toHaveLength(1);
    const evt = emitted[0];
    expect(evt.type).toBe('result');
    expect(evt.is_error).toBe(false);
    expect(evt.subtype).toBe('success');
  });

  test('message_start → emits result event', () => {
    feedLine(cli, FIXTURE_MESSAGE_START);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe('result');
    expect(emitted[0].is_error).toBe(false);
  });

  test('message_delta → emits result event', () => {
    feedLine(cli, FIXTURE_MESSAGE_DELTA);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe('result');
  });

  test('tool_use → emits assistant text describing the tool', () => {
    feedLine(cli, FIXTURE_TOOL_USE);

    expect(emitted).toHaveLength(1);
    const evt = emitted[0];
    expect(evt.type).toBe('assistant');
    const message = evt.message as { content: Array<{ text: string }> };
    expect(message.content[0].text).toContain('bash');
  });

  test('tool_call → emits assistant text describing the tool', () => {
    feedLine(cli, FIXTURE_TOOL_CALL);

    expect(emitted).toHaveLength(1);
    const evt = emitted[0];
    expect(evt.type).toBe('assistant');
    const message = evt.message as { content: Array<{ text: string }> };
    expect(message.content[0].text).toContain('read_file');
  });

  test('error → sets isPermanentFailure() true and emits error result', () => {
    const exitCodes: Array<number | null> = [];
    cli.on('exit', (code: number | null) => exitCodes.push(code));

    feedLine(cli, FIXTURE_ERROR);

    expect(emitted).toHaveLength(1);
    const evt = emitted[0];
    expect(evt.type).toBe('result');
    expect(evt.is_error).toBe(true);
    expect(cli.isPermanentFailure()).toBe(true);
    expect(cli.getPermanentFailureReason()).toContain('Pi agent crashed');
    expect(exitCodes).toHaveLength(1);
  });

  test('extension_ui_request is silently ignored', () => {
    feedLine(cli, FIXTURE_EXTENSION_UI);

    expect(emitted).toHaveLength(0);
    expect(cli.isPermanentFailure()).toBe(false);
  });

  test('unknown event types are silently ignored', () => {
    feedLine(cli, JSON.stringify({ type: 'some_unknown_event', data: 'xyz' }));

    expect(emitted).toHaveLength(0);
  });

  test('malformed JSON is silently ignored', () => {
    feedLine(cli, 'not-valid-json {');

    expect(emitted).toHaveLength(0);
    expect(cli.isPermanentFailure()).toBe(false);
  });

  test('multiple events in one chunk are all processed', () => {
    const chunk = FIXTURE_TEXT_DELTA + '\n' + FIXTURE_MESSAGE_STOP + '\n';
    (cli as unknown as AnyPiCli).parseOutput(chunk);

    expect(emitted).toHaveLength(2);
    expect(emitted[0].type).toBe('assistant');
    expect(emitted[1].type).toBe('result');
  });
});
