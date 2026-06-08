/**
 * Harness module public API
 *
 * Re-exports everything from adapter.ts and registry.ts so consumers
 * can import from 'src/harness/index.js' without knowing the internal layout.
 */

export type { Capabilities, HarnessType, HarnessInfo } from './adapter.js';
export { detectHarnesses, getDefaultHarness } from './registry.js';
export { CodexCli, CODEX_CAPABILITIES } from './codex/index.js';
export { PiCli, PI_CAPABILITIES } from './pi/index.js';
