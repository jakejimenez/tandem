/**
 * Unit tests for the session ownership registry (multiuser/channel.ts).
 */

import { describe, test, expect } from 'bun:test';
import {
  registerSessionOwner,
  getSessionOwner,
  isSessionOwner,
  unregisterSession,
} from './channel.js';

// ---------------------------------------------------------------------------
// Helpers — use unique IDs per test to avoid cross-test state bleed since
// the ownership map is a module-level singleton.
// ---------------------------------------------------------------------------

let counter = 0;
function uniqueIds(): { platformId: string; channelId: string; threadId: string } {
  counter++;
  return {
    platformId: `platform-${counter}`,
    channelId: `channel-${counter}`,
    threadId: `thread-${counter}`,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('session ownership registry', () => {
  describe('registerSessionOwner / getSessionOwner', () => {
    test('returns the registered userId for a triple', () => {
      const { platformId, channelId, threadId } = uniqueIds();

      registerSessionOwner(platformId, channelId, threadId, 'user-alice');
      expect(getSessionOwner(platformId, channelId, threadId)).toBe('user-alice');
    });

    test('returns undefined for an unregistered triple', () => {
      const { platformId, channelId, threadId } = uniqueIds();

      expect(getSessionOwner(platformId, channelId, threadId)).toBeUndefined();
    });

    test('overwrites an existing registration with a new userId', () => {
      const { platformId, channelId, threadId } = uniqueIds();

      registerSessionOwner(platformId, channelId, threadId, 'user-alice');
      registerSessionOwner(platformId, channelId, threadId, 'user-bob');

      expect(getSessionOwner(platformId, channelId, threadId)).toBe('user-bob');
    });

    test('different triples are independent', () => {
      const ids1 = uniqueIds();
      const ids2 = uniqueIds();

      registerSessionOwner(ids1.platformId, ids1.channelId, ids1.threadId, 'user-alice');
      registerSessionOwner(ids2.platformId, ids2.channelId, ids2.threadId, 'user-bob');

      expect(getSessionOwner(ids1.platformId, ids1.channelId, ids1.threadId)).toBe('user-alice');
      expect(getSessionOwner(ids2.platformId, ids2.channelId, ids2.threadId)).toBe('user-bob');
    });
  });

  describe('isSessionOwner', () => {
    test('returns true when userId matches the registered owner', () => {
      const { platformId, channelId, threadId } = uniqueIds();

      registerSessionOwner(platformId, channelId, threadId, 'user-alice');
      expect(isSessionOwner(platformId, channelId, threadId, 'user-alice')).toBe(true);
    });

    test('returns false for a different userId', () => {
      const { platformId, channelId, threadId } = uniqueIds();

      registerSessionOwner(platformId, channelId, threadId, 'user-alice');
      expect(isSessionOwner(platformId, channelId, threadId, 'user-bob')).toBe(false);
    });

    test('returns false when no owner registered', () => {
      const { platformId, channelId, threadId } = uniqueIds();

      expect(isSessionOwner(platformId, channelId, threadId, 'user-alice')).toBe(false);
    });
  });

  describe('unregisterSession', () => {
    test('removes ownership so getSessionOwner returns undefined', () => {
      const { platformId, channelId, threadId } = uniqueIds();

      registerSessionOwner(platformId, channelId, threadId, 'user-alice');
      unregisterSession(platformId, channelId, threadId);

      expect(getSessionOwner(platformId, channelId, threadId)).toBeUndefined();
    });

    test('isSessionOwner returns false after unregister', () => {
      const { platformId, channelId, threadId } = uniqueIds();

      registerSessionOwner(platformId, channelId, threadId, 'user-alice');
      unregisterSession(platformId, channelId, threadId);

      expect(isSessionOwner(platformId, channelId, threadId, 'user-alice')).toBe(false);
    });

    test('unregistering a triple that was never registered is a no-op', () => {
      const { platformId, channelId, threadId } = uniqueIds();

      expect(() => {
        unregisterSession(platformId, channelId, threadId);
      }).not.toThrow();
    });

    test('unregistering one triple does not affect another', () => {
      const ids1 = uniqueIds();
      const ids2 = uniqueIds();

      registerSessionOwner(ids1.platformId, ids1.channelId, ids1.threadId, 'user-alice');
      registerSessionOwner(ids2.platformId, ids2.channelId, ids2.threadId, 'user-bob');

      unregisterSession(ids1.platformId, ids1.channelId, ids1.threadId);

      expect(getSessionOwner(ids1.platformId, ids1.channelId, ids1.threadId)).toBeUndefined();
      expect(getSessionOwner(ids2.platformId, ids2.channelId, ids2.threadId)).toBe('user-bob');
    });
  });
});
