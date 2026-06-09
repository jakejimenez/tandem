/**
 * FIFO concurrency queue for Multi-User Channel Mode.
 *
 * When the server is at capacity, incoming requests queue rather than reject.
 * Each entry gets a slot when one becomes available, or times out first.
 */

export interface QueueEntry {
  platformId: string;
  channelId: string;
  threadId: string;
  userId: string;
  enqueued: Date;
  timeoutMs: number;
  resolve: () => void;
  reject: (err: Error) => void;
}

export class ConcurrencyQueue {
  private _active = 0;
  private readonly queue: QueueEntry[] = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly timeoutMs: number,
  ) {}

  /**
   * Acquire a slot. Resolves immediately when capacity is available, otherwise
   * waits in FIFO order. Rejects with a timeout error when timeoutMs elapses.
   */
  async acquire(
    entry: Omit<QueueEntry, 'resolve' | 'reject' | 'enqueued'>,
  ): Promise<void> {
    // Slot available immediately — take it.
    if (this._active < this.maxConcurrent) {
      this._active++;
      return;
    }

    // Queue and wait.
    return new Promise<void>((resolve, reject) => {
      const full: QueueEntry = {
        ...entry,
        enqueued: new Date(),
        resolve,
        reject,
      };

      const timer = setTimeout(() => {
        const idx = this.queue.indexOf(full);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
        }
        reject(
          new Error(
            `Queue timeout after ${entry.timeoutMs ?? this.timeoutMs}ms for user ${entry.userId}`,
          ),
        );
      }, entry.timeoutMs ?? this.timeoutMs);

      // Store the timer on the entry so release() can clear it if needed.
      // We use a closure rather than mutating QueueEntry to avoid a type change.
      const originalResolve = full.resolve;
      full.resolve = () => {
        clearTimeout(timer);
        originalResolve();
      };

      this.queue.push(full);
    });
  }

  /**
   * Release a slot. Dequeues the next waiting entry (if any), otherwise
   * decrements the active counter.
   */
  release(): void {
    const next = this.queue.shift();
    if (next) {
      // Hand the slot directly to the next waiter.
      next.resolve();
    } else {
      this._active = Math.max(0, this._active - 1);
    }
  }

  /** Number of currently active (acquired) slots. */
  get active(): number {
    return this._active;
  }

  /** Number of requests waiting for a slot. */
  get pending(): number {
    return this.queue.length;
  }

  /**
   * Snapshot of the waiting queue for admin display.
   */
  getQueue(): Array<{
    userId: string;
    channelId: string;
    position: number;
    enqueued: Date;
  }> {
    return this.queue.map((e, i) => ({
      userId: e.userId,
      channelId: e.channelId,
      position: i + 1,
      enqueued: e.enqueued,
    }));
  }
}
