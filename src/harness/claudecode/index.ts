/**
 * Claude Code harness adapter
 *
 * Declares the capabilities of Claude Code and re-exports the existing
 * ClaudeCli class and version-detection utilities so callers can reference
 * harness-specific things through the harness/ overlay without having to
 * reach directly into src/claude/.
 *
 * NOTE: src/claude/ is intentionally not moved or modified — this is a
 * pure overlay so the live Claude Code path continues to work unchanged.
 */

import type { Capabilities } from '../adapter.js';

export { ClaudeCli } from '../../claude/cli.js';
export { getClaudeCliVersion, getClaudePath, validateClaudeCli } from '../../claude/version-check.js';

/**
 * Full capability set for Claude Code.
 * All interactive features are supported.
 */
export const CLAUDE_CODE_CAPABILITIES: Capabilities = {
  interactiveApproval: true,
  planApproval: true,
  multipleChoice: true,
  compaction: true,
  costEvents: true,
};
