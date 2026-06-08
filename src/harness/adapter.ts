/**
 * Harness Adapter Interface
 *
 * Defines shared types and interfaces for harness adapters.
 * A "harness" is the AI coding assistant CLI that Tandem manages
 * (e.g. Claude Code, OpenCode, Codex, Pi).
 */

/**
 * Capabilities that a harness adapter may support.
 */
export interface Capabilities {
  /** Can route per-tool approve/deny to chat (thumbs up/down reactions) */
  interactiveApproval: boolean;
  /** Surfaces ExitPlanMode for user approval */
  planApproval: boolean;
  /** Surfaces AskUserQuestion for user responses */
  multipleChoice: boolean;
  /** Supports !compact signal */
  compaction: boolean;
  /** Emits token/cost data */
  costEvents: boolean;
}

/**
 * Known harness types.
 */
export type HarnessType = 'claude-code' | 'opencode' | 'pi' | 'codex';

/**
 * Information about a detected harness installation.
 */
export interface HarnessInfo {
  type: HarnessType;
  displayName: string;
  capabilities: Capabilities;
  version: string | null;
  available: boolean;
}
