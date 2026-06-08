/**
 * Harness Registry
 *
 * Detects available harnesses and returns their HarnessInfo descriptors.
 * Currently only detects Claude Code; additional harnesses will be added
 * in later tasks.
 */

import type { HarnessInfo, HarnessType } from './adapter.js';
import { CLAUDE_CODE_CAPABILITIES } from './claudecode/index.js';
import { getClaudeCliVersion } from '../claude/version-check.js';

/**
 * Detect all available harnesses on this machine.
 *
 * For now only Claude Code is detected. Other harnesses (OpenCode, Pi, Codex)
 * will be added as adapters are introduced in tasks 4-6.
 */
export async function detectHarnesses(): Promise<HarnessInfo[]> {
  const result = getClaudeCliVersion();

  const claudeCodeInfo: HarnessInfo = {
    type: 'claude-code',
    displayName: 'Claude Code',
    capabilities: CLAUDE_CODE_CAPABILITIES,
    version: result.version,
    available: !result.error && (result.version !== null || result.rawOutput !== null),
  };

  return [claudeCodeInfo];
}

/**
 * Return the default harness type to use when none is explicitly configured.
 */
export async function getDefaultHarness(): Promise<HarnessType> {
  return 'claude-code';
}
