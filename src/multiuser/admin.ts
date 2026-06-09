/**
 * Admin command handlers for Multi-User Channel Mode.
 *
 * All responses are posted as visible messages (ephemeral support is
 * platform-specific and not universally available on the PlatformClient
 * interface; callers can post to a DM thread if they need privacy).
 */

import type { PlatformClient } from '../platform/index.js';
import type { Session } from '../session/types.js';
import type { ConcurrencyQueue } from './queue.js';

// ---------------------------------------------------------------------------
// !admin sessions — list all active sessions
// ---------------------------------------------------------------------------

/**
 * Post a summary of all active sessions to the channel.
 * Intended for admin users only; callers are responsible for the auth check.
 */
export async function handleAdminSessions(
  platform: PlatformClient,
  channelId: string,
  _userId: string,
  sessions: Map<string, Session>,
): Promise<void> {
  const fmt = platform.getFormatter();

  if (sessions.size === 0) {
    await platform.createPost(`${fmt.formatBold('Admin › Sessions')}\n\nNo active sessions.`, channelId);
    return;
  }

  const lines: string[] = [`${fmt.formatBold('Admin › Sessions')} (${sessions.size} active)\n`];

  for (const session of sessions.values()) {
    const age = Math.round((Date.now() - session.startedAt.getTime()) / 60_000);
    const state = session.lifecycle.state;
    lines.push(
      `• ${fmt.formatCode(session.threadId.slice(0, 12))}  owner=${session.startedBy}  state=${state}  age=${age}m`,
    );
  }

  await platform.createPost(lines.join('\n'), channelId);
}

// ---------------------------------------------------------------------------
// !admin kill <threadId> — forcibly end a session
// ---------------------------------------------------------------------------

/**
 * Kill a specific session by threadId prefix or full threadId.
 * Posts confirmation (or error) to the channel.
 */
export async function handleAdminKill(
  platform: PlatformClient,
  channelId: string,
  targetThreadId: string,
  sessions: Map<string, Session>,
): Promise<void> {
  const fmt = platform.getFormatter();

  // Allow prefix match so admins don't need the full ID.
  let found: Session | undefined;
  for (const session of sessions.values()) {
    if (session.threadId === targetThreadId || session.threadId.startsWith(targetThreadId)) {
      found = session;
      break;
    }
  }

  if (!found) {
    await platform.createPost(
      `⚠️ No active session found matching ${fmt.formatCode(targetThreadId)}`,
      channelId,
    );
    return;
  }

  // Kill the harness process. The normal exit handler will do the rest.
  found.claude.kill();

  await platform.createPost(
    `🛑 ${fmt.formatBold('Session killed')} by admin — thread ${fmt.formatCode(found.threadId.slice(0, 12))} (owner: ${found.startedBy})`,
    channelId,
  );
}

// ---------------------------------------------------------------------------
// !admin queue — show pending queue
// ---------------------------------------------------------------------------

/**
 * Post the current concurrency queue state to the channel.
 */
export async function handleAdminQueue(
  platform: PlatformClient,
  channelId: string,
  _userId: string,
  queue: ConcurrencyQueue,
): Promise<void> {
  const fmt = platform.getFormatter();
  const entries = queue.getQueue();

  const header = `${fmt.formatBold('Admin › Queue')}  active=${queue.active}  pending=${queue.pending}`;

  if (entries.length === 0) {
    await platform.createPost(`${header}\n\nQueue is empty.`, channelId);
    return;
  }

  const lines: string[] = [`${header}\n`];
  for (const e of entries) {
    const waitSec = Math.round((Date.now() - e.enqueued.getTime()) / 1000);
    lines.push(`${e.position}. user=${e.userId}  channel=${e.channelId}  waiting=${waitSec}s`);
  }

  await platform.createPost(lines.join('\n'), channelId);
}

// ---------------------------------------------------------------------------
// !admin capacity — show active/max counts
// ---------------------------------------------------------------------------

/**
 * Post active vs. max capacity to the channel.
 */
export async function handleAdminCapacity(
  platform: PlatformClient,
  channelId: string,
  _userId: string,
  queue: ConcurrencyQueue,
): Promise<void> {
  const fmt = platform.getFormatter();
  await platform.createPost(
    `${fmt.formatBold('Admin › Capacity')}  active=${queue.active}  pending=${queue.pending}`,
    channelId,
  );
}
