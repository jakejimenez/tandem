# AGENTS.md — Tandem Codebase Guide for AI Coding Agents

This file documents the architecture and key extension points so an AI agent can orient quickly.

---

## Repository Layout

```
src/
  harness/          # Harness adapter layer (one subdirectory per harness)
  multiuser/        # Multi-User Channel Mode (ownership registry, queue)
  permissions/      # Permission engine (mode logic, MCP server)
  claude/           # Claude Code CLI wrapper (the original adapter)
  platform/         # Chat platform abstractions (Slack, Mattermost)
  config/           # Config file read/write, setup wizard helpers
  auto-update/      # npm version check and self-restart logic
  ui/               # Terminal UI helpers
  test-utils/       # Shared test fixtures and utilities
```

---

## Harness Adapter Layer (`src/harness/`)

Every AI coding harness (Claude Code, OpenCode, Pi, Codex) is wrapped in an adapter that:

1. Implements the `HarnessProcess` interface (`src/harness/adapter.ts`).
2. Translates harness-specific output (JSONL, SSE, RPC) into `ClaudeEvent`-shaped objects emitted on the EventEmitter `'event'` channel.
3. Exposes `start()`, `sendMessage()`, `kill()`, `interrupt()`, `isPermanentFailure()`, and `getStatusData()`.

### How to add a new harness

1. Create `src/harness/<name>/index.ts`. Extend `EventEmitter` and implement `HarnessProcess`.
2. Export a `<NAME>_CAPABILITIES: Capabilities` constant describing what the harness supports.
3. Add a `HarnessType` literal to `adapter.ts` and a detection entry in `src/harness/registry.ts`.
4. Wire the new type into the setup wizard (`src/onboarding.ts`) so users can select it.
5. Add `src/harness/<name>/index.test.ts` — feed fixture JSONL/SSE strings through the private parser (cast to access private methods) and assert the emitted `ClaudeEvent` shapes.

### Event contract

All adapters emit on `'event'` with objects shaped like:

```ts
// Assistant text
{ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: string }] } }

// Turn complete (success)
{ type: 'result', subtype: 'success', is_error: false, ... }

// Turn failed
{ type: 'result', subtype: 'error_during_generation', is_error: true, error: unknown }

// Tool use (for interactive approval harnesses)
{ type: 'tool_use', id: string, name: string, input: unknown }
```

---

## Permission Engine (`src/permissions/`)

Controls whether Claude (or another harness) can execute a tool without asking:

- `bypass` — all tools allowed, no prompts.
- `default` — every tool action triggers a thumbs-up/thumbs-down emoji reaction in chat.
- `auto` — Claude's built-in classifier auto-approves low-risk actions; high-risk still prompts.

The MCP server (`mcp-server/`) is the bridge: Claude calls `mcp__tandem-mcp__permission_prompt` and the server routes the approval request to the chat thread, then waits for a reaction.

---

## Multi-User Channel Mode (`src/multiuser/`)

Allows multiple users to run independent sessions in the same channel.

### Ownership registry (`channel.ts`)

A module-level `Map<"platformId:channelId:threadId", userId>` tracks who owns each thread. Key functions:

- `registerSessionOwner(platformId, channelId, threadId, userId)` — called when a session starts.
- `isSessionOwner(...)` — used to gate follow-up messages.
- `unregisterSession(...)` — called on session end.

State is in-memory only; it resets on bot restart.

### Concurrency queue (`queue.ts`)

`ConcurrencyQueue(maxConcurrent, timeoutMs)` is a FIFO promise queue. When all slots are taken, `acquire()` returns a promise that resolves when a slot frees up, or rejects after `timeoutMs`. Callers must call `release()` when done.

### Admin commands (`admin.ts`)

Commands prefixed with `!admin` are restricted to the configured admin user list. They include session listing, forced stop, and queue inspection.

---

## Testing Conventions

- Test files live alongside source files as `<module>.test.ts`.
- Use `bun test src/` to run the full suite (currently ~2600+ tests).
- Adapter tests use private-method casts (`cli as unknown as { parseOutput: ... }`) to drive parsing logic without spawning real processes.
- Multiuser tests use unique IDs per test (counter-based) to avoid cross-test state pollution from the singleton ownership map.
- Keep tests fast: no live network calls, no real subprocesses, no sleeps longer than ~100 ms.

---

## Attribution

