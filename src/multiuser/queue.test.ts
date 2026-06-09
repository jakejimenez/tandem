/**
 * Unit tests for ConcurrencyQueue (multiuser/queue.ts).
 */

import { describe, test, expect } from 'bun:test';
import { ConcurrencyQueue } from './queue.js';

// ---------------------------------------------------------------------------
// Shared entry fixture (fields required by acquire, minus resolve/reject/enqueued)
// ---------------------------------------------------------------------------
const BASE_ENTRY = {
  platformId: 'slack',
  channelId: 'C123',
  threadId: 'T456',
  userId: 'user-1',
  timeoutMs: 5000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConcurrencyQueue', () => {
  describe('acquire — under capacity', () => {
    test('resolves immediately when maxConcurrent is 1 and no slots are taken', async () => {
      const q = new ConcurrencyQueue(1, 5000);

      const start = Date.now();
      await q.acquire(BASE_ENTRY);
      const elapsed = Date.now() - start;

      expect(q.active).toBe(1);
      expect(q.pending).toBe(0);
      // Should be near-instant (well under 50 ms)
      expect(elapsed).toBeLessThan(50);
    });

    test('resolves immediately for each of N concurrent slots', async () => {
      const q = new ConcurrencyQueue(3, 5000);

      await q.acquire({ ...BASE_ENTRY, userId: 'u1' });
      await q.acquire({ ...BASE_ENTRY, userId: 'u2' });
      await q.acquire({ ...BASE_ENTRY, userId: 'u3' });

      expect(q.active).toBe(3);
      expect(q.pending).toBe(0);
    });
  });

  describe('acquire — at capacity', () => {
    test('second acquire waits until release() is called', async () => {
      const q = new ConcurrencyQueue(1, 5000);

      // Take the only slot.
      await q.acquire(BASE_ENTRY);
      expect(q.active).toBe(1);

      // Second acquire should block — wrap in a flag to verify ordering.
      let secondResolved = false;
      const second = q.acquire({ ...BASE_ENTRY, userId: 'user-2' }).then(() => {
        secondResolved = true;
      });

      // Give the event loop a tick — second should still be pending.
      await Promise.resolve();
      expect(secondResolved).toBe(false);
      expect(q.pending).toBe(1);

      // Release → second should resolve.
      q.release();
      await second;
      expect(secondResolved).toBe(true);
      expect(q.active).toBe(1); // slot handed directly to waiter
      expect(q.pending).toBe(0);
    });

    test('active counter decrements when release has no waiters', async () => {
      const q = new ConcurrencyQueue(2, 5000);

      await q.acquire({ ...BASE_ENTRY, userId: 'u1' });
      await q.acquire({ ...BASE_ENTRY, userId: 'u2' });
      expect(q.active).toBe(2);

      q.release();
      expect(q.active).toBe(1);

      q.release();
      expect(q.active).toBe(0);
    });
  });

  describe('acquire — timeout', () => {
    test('rejects if release never comes within timeoutMs', async () => {
      // Use a 1-slot queue with a 50 ms default timeout.
      // The waiter entry also gets timeoutMs: 50 to use the queue default path.
      const q = new ConcurrencyQueue(1, 50);

      await q.acquire({ ...BASE_ENTRY, timeoutMs: 50 }); // fills the slot

      // Second acquire: timeoutMs: 50 so it times out quickly.
      const waitPromise = q.acquire({ ...BASE_ENTRY, userId: 'user-2', timeoutMs: 50 });

      await expect(waitPromise).rejects.toThrow(/timeout/i);
      // After timeout the entry is removed from the queue.
      expect(q.pending).toBe(0);
    }, 1000 /* ms per-test timeout */);

    test('per-entry timeoutMs overrides the queue default', async () => {
      // Queue has a long default timeout; entry overrides to 50 ms.
      const q = new ConcurrencyQueue(1, 60_000);

      await q.acquire({ ...BASE_ENTRY, timeoutMs: 60_000 });

      // Waiter entry explicitly sets a short timeout.
      const waitPromise = q.acquire({ ...BASE_ENTRY, userId: 'user-2', timeoutMs: 50 });
      await expect(waitPromise).rejects.toThrow(/timeout/i);
    }, 1000 /* ms per-test timeout */);
  });

  describe('getQueue snapshot', () => {
    test('returns position-ordered list of waiting entries', async () => {
      const q = new ConcurrencyQueue(1, 5000);

      await q.acquire(BASE_ENTRY); // fill slot

      // Two waiters
      const p1 = q.acquire({ ...BASE_ENTRY, userId: 'waiter-1' });
      const p2 = q.acquire({ ...BASE_ENTRY, userId: 'waiter-2' });

      const snapshot = q.getQueue();
      expect(snapshot).toHaveLength(2);
      expect(snapshot[0].userId).toBe('waiter-1');
      expect(snapshot[0].position).toBe(1);
      expect(snapshot[1].userId).toBe('waiter-2');
      expect(snapshot[1].position).toBe(2);

      // Drain so promises resolve and we don't leave dangling timers.
      q.release();
      await p1;
      q.release();
      await p2;
    });
  });
});
