/**
 * Harness module public API
 *
 * Re-exports everything from adapter.ts and registry.ts so consumers
 * can import from 'src/harness/index.js' without knowing the internal layout.
 */

export type { Capabilities, HarnessType, HarnessInfo, HarnessProcess } from './adapter.js';
export { detectHarnesses, getDefaultHarness, createHarness } from './registry.js';
export type { HarnessCreateOptions } from './registry.js';
export { CodexCli, CODEX_CAPABILITIES } from './codex/index.js';
export { PiCli, PI_CAPABILITIES } from './pi/index.js';
export { OpenCodeCli, OPENCODE_CAPABILITIES } from './opencode/index.js';
export { getUserHarnessPreference, setUserHarnessPreference, clearUserHarnessPreference } from './prefs.js';
