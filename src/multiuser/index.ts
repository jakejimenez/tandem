/**
 * Multi-User Channel Mode — public API
 */

export {
  registerSessionOwner,
  getSessionOwner,
  isSessionOwner,
  unregisterSession,
} from './channel.js';

export { ConcurrencyQueue } from './queue.js';
export type { QueueEntry } from './queue.js';

export {
  handleAdminSessions,
  handleAdminKill,
  handleAdminQueue,
  handleAdminCapacity,
} from './admin.js';
