/**
 * Session ownership registry for Multi-User Channel Mode.
 *
 * Tracks which user "owns" a given (platformId, channelId, threadId) triple.
 * A session is created when the owner starts it; unauthorized users who reply
 * in the thread receive a polite notice instead of reaching Claude.
 *
 * All state is in-memory. Ownership is registered when a session starts and
 * unregistered when it ends.
 */

/** Composite map key: "platformId:channelId:threadId" */
function makeKey(platformId: string, channelId: string, threadId: string): string {
  return `${platformId}:${channelId}:${threadId}`;
}

// Key: "platformId:channelId:threadId"  →  ownerUserId
const ownership = new Map<string, string>();

/**
 * Register an owner for a (platformId, channelId, threadId) triple.
 * Called when a new session is created in channel mode.
 */
export function registerSessionOwner(
  platformId: string,
  channelId: string,
  threadId: string,
  userId: string,
): void {
  ownership.set(makeKey(platformId, channelId, threadId), userId);
}

/**
 * Return the owner userId for a triple, or undefined if not registered.
 */
export function getSessionOwner(
  platformId: string,
  channelId: string,
  threadId: string,
): string | undefined {
  return ownership.get(makeKey(platformId, channelId, threadId));
}

/**
 * Return true when userId matches the registered owner.
 */
export function isSessionOwner(
  platformId: string,
  channelId: string,
  threadId: string,
  userId: string,
): boolean {
  return ownership.get(makeKey(platformId, channelId, threadId)) === userId;
}

/**
 * Remove ownership for a (platformId, channelId, threadId) triple.
 * Called when the session ends.
 */
export function unregisterSession(
  platformId: string,
  channelId: string,
  threadId: string,
): void {
  ownership.delete(makeKey(platformId, channelId, threadId));
}
