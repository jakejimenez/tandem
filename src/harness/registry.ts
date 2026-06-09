/**
 * Harness Registry
 *
 * Detects available harnesses and returns their HarnessInfo descriptors.
 * Currently detects Claude Code and Codex; additional harnesses will be added
 * in later tasks.
 */

import { execSync } from 'child_process';
import type { HarnessInfo, HarnessType, HarnessProcess } from './adapter.js';
import { CLAUDE_CODE_CAPABILITIES } from './claudecode/index.js';
import { ClaudeCli } from './claudecode/index.js';
import { CodexCli, CODEX_CAPABILITIES } from './codex/index.js';
import { PiCli, PI_CAPABILITIES } from './pi/index.js';
import { OpenCodeCli, OPENCODE_CAPABILITIES } from './opencode/index.js';
import { getClaudeCliVersion } from '../claude/version-check.js';
import type { ClaudeCliOptions } from '../claude/cli.js';

/**
 * Try to get the Codex version by running `codex --version`.
 */
function getCodexVersion(): string | null {
  try {
    const output = execSync('codex --version', {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    // Try to extract version from output (e.g., "Codex 1.0.0" or "1.0.0")
    const patterns = [
      /^([\d]+\.[\d]+\.[\d]+)/,           // Version at start
      /version\s+([\d]+\.[\d]+\.[\d]+)/i, // "version X.Y.Z"
      /v?([\d]+\.[\d]+\.[\d]+)/,          // Any X.Y.Z pattern
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // Codex found but couldn't parse version
    return null;
  } catch {
    return null;
  }
}

/**
 * Try to get the OpenCode version by running `opencode --version`.
 */
function getOpenCodeVersion(): string | null {
  try {
    const output = execSync('opencode --version', {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const patterns = [
      /^([\d]+\.[\d]+\.[\d]+)/,           // Version at start
      /version\s+([\d]+\.[\d]+\.[\d]+)/i, // "version X.Y.Z"
      /v?([\d]+\.[\d]+\.[\d]+)/,          // Any X.Y.Z pattern
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Try to get the Pi version by running `pi --version`.
 */
function getPiVersion(): string | null {
  try {
    const output = execSync('pi --version', {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    // Try to extract version from output (e.g., "0.74.2" or "Pi 0.74.2")
    const patterns = [
      /^([\d]+\.[\d]+\.[\d]+)/,           // Version at start
      /version\s+([\d]+\.[\d]+\.[\d]+)/i, // "version X.Y.Z"
      /v?([\d]+\.[\d]+\.[\d]+)/,          // Any X.Y.Z pattern
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // Pi found but couldn't parse version
    return null;
  } catch {
    return null;
  }
}

/**
 * Detect all available harnesses on this machine.
 *
 * Detects Claude Code, Codex, and Pi.
 */
export async function detectHarnesses(): Promise<HarnessInfo[]> {
  const harnesses: HarnessInfo[] = [];

  // Detect Claude Code
  const claudeResult = getClaudeCliVersion();
  const claudeCodeInfo: HarnessInfo = {
    type: 'claude-code',
    displayName: 'Claude Code',
    capabilities: CLAUDE_CODE_CAPABILITIES,
    version: claudeResult.version,
    available: !claudeResult.error && (claudeResult.version !== null || claudeResult.rawOutput !== null),
  };
  harnesses.push(claudeCodeInfo);

  // Detect Codex
  const codexVersion = getCodexVersion();
  const codexInfo: HarnessInfo = {
    type: 'codex',
    displayName: 'Codex',
    capabilities: CODEX_CAPABILITIES,
    version: codexVersion,
    available: codexVersion !== null,
  };
  harnesses.push(codexInfo);

  // Detect Pi
  const piVersion = getPiVersion();
  const piInfo: HarnessInfo = {
    type: 'pi',
    displayName: 'Pi',
    capabilities: PI_CAPABILITIES,
    version: piVersion,
    available: piVersion !== null,
  };
  harnesses.push(piInfo);

  // Detect OpenCode
  const openCodeVersion = getOpenCodeVersion();
  const openCodeInfo: HarnessInfo = {
    type: 'opencode',
    displayName: 'OpenCode',
    capabilities: OPENCODE_CAPABILITIES,
    version: openCodeVersion,
    available: openCodeVersion !== null,
  };
  harnesses.push(openCodeInfo);

  return harnesses;
}

/**
 * Return the default harness type to use when none is explicitly configured.
 */
async function getDefaultHarness(): Promise<HarnessType> {
  return 'claude-code';
}

// =============================================================================
// Harness factory
// =============================================================================

/**
 * Options passed to createHarness(). These cover the common fields needed by
 * all adapters. The Claude Code path receives the full ClaudeCliOptions so the
 * existing session path is completely unchanged.
 */
export interface HarnessCreateOptions {
  /** Full options for the Claude Code adapter (ignored by other adapters) */
  claudeCliOptions?: ClaudeCliOptions;
  /** Working directory for non-Claude-Code adapters */
  workingDir?: string;
  /** Prompt to send immediately after start() (Codex / Pi / OpenCode) */
  prompt?: string;
  /** Session ID for Codex resume */
  sessionId?: string;
  /** Codex sandbox mode */
  sandboxMode?: 'read-only' | 'workspace-write' | 'full-access';
}

/**
 * Factory that instantiates the correct HarnessProcess for the given type.
 *
 * - 'claude-code' → ClaudeCli (requires options.claudeCliOptions)
 * - 'codex'       → CodexCli
 * - 'pi'          → PiCli
 * - 'opencode'    → OpenCodeCli
 *
 * The Claude Code path is identical to calling `new ClaudeCli(options)` directly,
 * so existing behavior is fully preserved.
 */
export function createHarness(type: HarnessType, options: HarnessCreateOptions): HarnessProcess {
  switch (type) {
    case 'claude-code': {
      if (!options.claudeCliOptions) {
        throw new Error('createHarness: claudeCliOptions is required for claude-code');
      }
      return new ClaudeCli(options.claudeCliOptions);
    }

    case 'codex': {
      return new CodexCli({
        workingDir: options.workingDir ?? options.claudeCliOptions?.workingDir ?? process.cwd(),
        sessionId: options.sessionId,
        prompt: options.prompt,
        sandboxMode: options.sandboxMode ?? 'workspace-write',
      });
    }

    case 'pi': {
      return new PiCli({
        workingDir: options.workingDir ?? options.claudeCliOptions?.workingDir ?? process.cwd(),
        prompt: options.prompt,
      });
    }

    case 'opencode': {
      return new OpenCodeCli({
        workingDir: options.workingDir ?? options.claudeCliOptions?.workingDir ?? process.cwd(),
        prompt: options.prompt,
      });
    }

    default: {
      // TypeScript exhaustiveness guard
      const _exhaustive: never = type;
      throw new Error(`createHarness: unknown harness type "${String(_exhaustive)}"`);
    }
  }
}
