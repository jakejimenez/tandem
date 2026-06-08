/**
 * Harness Registry
 *
 * Detects available harnesses and returns their HarnessInfo descriptors.
 * Currently detects Claude Code and Codex; additional harnesses will be added
 * in later tasks.
 */

import { execSync } from 'child_process';
import type { HarnessInfo, HarnessType } from './adapter.js';
import { CLAUDE_CODE_CAPABILITIES } from './claudecode/index.js';
import { CODEX_CAPABILITIES } from './codex/index.js';
import { PI_CAPABILITIES } from './pi/index.js';
import { getClaudeCliVersion } from '../claude/version-check.js';

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

  return harnesses;
}

/**
 * Return the default harness type to use when none is explicitly configured.
 */
export async function getDefaultHarness(): Promise<HarnessType> {
  return 'claude-code';
}
