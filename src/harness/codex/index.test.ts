/**
 * Unit tests for the Codex harness adapter event parsing.
 *
 * Uses the CodexCli class directly — no subprocess is spawned. We drive
 * the private parseOutput / handleCodexEvent logic via the public EventEmitter
 * interface by calling the private method through a cast (same pattern used in
 * claude/cli.test.ts for maybeEmitRateLimit).
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { CodexCli } from './index.js';

// ---------------------------------------------------------------------------
// Helper: feed a raw JSONL string into the parser without spawning a process.
// ---------------------------------------------------------------------------
type AnyCodexCli = {
  parseOutput: (data: string) => void;
};

function feedLine(cli: CodexCli, jsonLine: string): void {
  // Add trailing newline so the JSONL parser sees a complete line.
  (cli as unknown as AnyCodexCli).parseOutput(jsonLine + '\n');
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_TURN_COMPLETED = JSON.stringify({ type: 'turn.completed' });
const FIXTURE_TURN_FAILED = JSON.stringify({ type: 'turn.failed', error: 'rate limit exceeded' });
const FIXTURE_ITEM_ASSISTANT = JSON.stringify({
  type: 'item.created',
  item: { type: 'message', role: 'assistant', content: 'Hello from Codex!' },
});
const FIXTURE_ERROR = JSON.stringify({ type: 'error', error: 'something went wrong' });
const FIXTURE_ITEM_SUMMARY = JSON.stringify({
  type: 'item.created',
  item: { type: 'summary', summary: 'Codex finished the task.' },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CodexCli event parsing', () => {
  let cli: CodexCli;
  let emitted: Array<Record<string, unknown>>;

  beforeEach(() => {
    cli = new CodexCli({ workingDir: '/tmp', prompt: 'test' });
    emitted = [];
    cli.on('event', (evt: Record<string, unknown>) => emitted.push(evt));
  });

  test('turn.completed → result event with is_error: false', () => {
    feedLine(cli, FIXTURE_TURN_COMPLETED);

    expect(emitted).toHaveLength(1);
    const evt = emitted[0];
    expect(evt.type).toBe('result');
    expect(evt.is_error).toBe(false);
    expect(evt.subtype).toBe('success');
  });

  test('turn.failed → result event with is_error: true', () => {
    const exitCodes: Array<number | null> = [];
    cli.on('exit', (code: number | null) => exitCodes.push(code));

    feedLine(cli, FIXTURE_TURN_FAILED);

    expect(emitted).toHaveLength(1);
    const evt = emitted[0];
    expect(evt.type).toBe('result');
    expect(evt.is_error).toBe(true);
    expect(evt.subtype).toBe('error_during_generation');
    // turn.failed should also trigger exit
    expect(exitCodes).toHaveLength(1);
  });

  test('item event with assistant message text → emits assistant text event', () => {
    feedLine(cli, FIXTURE_ITEM_ASSISTANT);

    expect(emitted).toHaveLength(1);
    const evt = emitted[0];
    expect(evt.type).toBe('assistant');
    const message = evt.message as { role: string; content: Array<{ type: string; text: string }> };
    expect(message.role).toBe('assistant');
    expect(message.content[0].type).toBe('text');
    expect(message.content[0].text).toBe('Hello from Codex!');
  });

  test('item event with summary → emits assistant text event with summary text', () => {
    feedLine(cli, FIXTURE_ITEM_SUMMARY);

    expect(emitted).toHaveLength(1);
    const evt = emitted[0];
    expect(evt.type).toBe('assistant');
    const message = evt.message as { content: Array<{ text: string }> };
    expect(message.content[0].text).toBe('Codex finished the task.');
  });

  test('error event → sets isPermanentFailure() true', () => {
    const exitCodes: Array<number | null> = [];
    cli.on('exit', (code: number | null) => exitCodes.push(code));

    feedLine(cli, FIXTURE_ERROR);

    expect(cli.isPermanentFailure()).toBe(true);
    expect(cli.getPermanentFailureReason()).toContain('something went wrong');
    expect(exitCodes).toHaveLength(1);
  });

  test('unknown / internal events do not emit anything', () => {
    feedLine(cli, JSON.stringify({ type: 'thread.started' }));
    feedLine(cli, JSON.stringify({ type: 'turn.started' }));

    expect(emitted).toHaveLength(0);
  });

  test('malformed JSON line is silently ignored', () => {
    feedLine(cli, 'not-valid-json');

    expect(emitted).toHaveLength(0);
    expect(cli.isPermanentFailure()).toBe(false);
  });

  test('multiple lines in a single chunk are all processed', () => {
    const chunk = FIXTURE_TURN_COMPLETED + '\n' + FIXTURE_ITEM_ASSISTANT + '\n';
    (cli as unknown as AnyCodexCli).parseOutput(chunk);

    // turn.completed → result  +  item → assistant
    expect(emitted).toHaveLength(2);
    expect(emitted[0].type).toBe('result');
    expect(emitted[1].type).toBe('assistant');
  });
});
