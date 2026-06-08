/**
 * Harness preference store (in-memory)
 *
 * Stores per-user default harness preferences. Key is "platformId:userId",
 * value is the preferred HarnessType. A future task can persist this to disk.
 */

import type { HarnessType } from './adapter.js';

/**
 * In-memory map of user harness preferences.
 * Key: "platformId:userId"
 * Value: preferred HarnessType
 */
export const userHarnessPrefs = new Map<string, HarnessType>();

/**
 * Get a user's preferred harness type.
 * Returns undefined if no preference has been set.
 */
export function getUserHarnessPreference(platformId: string, userId: string): HarnessType | undefined {
  return userHarnessPrefs.get(`${platformId}:${userId}`);
}

/**
 * Set a user's preferred harness type.
 */
export function setUserHarnessPreference(platformId: string, userId: string, harnessType: HarnessType): void {
  userHarnessPrefs.set(`${platformId}:${userId}`, harnessType);
}

/**
 * Clear a user's harness preference (revert to system default).
 */
export function clearUserHarnessPreference(platformId: string, userId: string): void {
  userHarnessPrefs.delete(`${platformId}:${userId}`);
}
