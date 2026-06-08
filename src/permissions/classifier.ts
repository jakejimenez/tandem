/**
 * Permission Risk Classifier
 *
 * Classifies tools as low-risk or high-risk for auto-approval in 'auto' mode.
 */

/**
 * Classify a tool as low-risk or high-risk.
 *
 * Low-risk tools:
 * - Read-only file operations (Read, Glob, Grep)
 * - Web operations (WebSearch, WebFetch)
 * - Git read commands (status, log, diff, show)
 * - IDE/language tools (LSP, list_directory)
 *
 * High-risk patterns:
 * - File modifications (write, edit, delete, remove, create)
 * - Version control changes (commit, push)
 * - Package management (install)
 * - Code execution (exec, bash, run, shell)
 */
export function isLowRisk(toolName: string): boolean {
  const LOW_RISK = new Set([
    'Read',
    'Glob',
    'Grep',
    'WebSearch',
    'WebFetch',
    'git_status',
    'git_log',
    'git_diff',
    'git_show',
    'list_directory',
    'LSP',
  ]);

  const HIGH_RISK_PATTERNS = [
    'write',
    'edit',
    'delete',
    'remove',
    'create',
    'commit',
    'push',
    'install',
    'exec',
    'bash',
    'run',
    'shell',
  ];

  if (LOW_RISK.has(toolName)) {
    return true;
  }

  const lower = toolName.toLowerCase();
  return !HIGH_RISK_PATTERNS.some(p => lower.includes(p));
}
