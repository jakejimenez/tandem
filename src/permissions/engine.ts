/**
 * Permission Engine
 *
 * Capability-aware decision logic for tool-use permission handling.
 * Routes permission prompts based on harness capabilities and permission mode.
 */

import type { Capabilities } from '../harness/adapter.js';
import type { PermissionMode } from '../config/types.js';
import { isLowRisk } from './classifier.js';

export interface PermissionContext {
  capabilities: Capabilities;
  permissionMode: PermissionMode;
  toolName: string;
  toolInput: string;
}

export type PermissionAction =
  | { kind: 'prompt' }          // ask the user (👍/👎)
  | { kind: 'auto_approve' }    // silently allow (low-risk in auto mode)
  | { kind: 'bypass' }          // bypass mode — allow without prompt
  | { kind: 'inform_only'; message: string }  // harness can't approve; post info message

/**
 * Resolve the permission action for a tool-use based on capabilities and mode.
 *
 * Decision tree:
 * 1. If harness can't do interactive approval, return inform_only
 * 2. If mode is bypass, return bypass
 * 3. If mode is auto, classify risk — low → auto_approve, high → prompt
 * 4. Default mode → always prompt
 */
export function resolvePermissionAction(ctx: PermissionContext): PermissionAction {
  // If harness can't do interactive approval, always inform_only
  if (!ctx.capabilities.interactiveApproval) {
    return {
      kind: 'inform_only',
      message: `🔧 ${ctx.toolName} — no per-tool approval available for this harness (${ctx.permissionMode} mode)`,
    };
  }

  // bypass mode
  if (ctx.permissionMode === 'bypass') {
    return { kind: 'bypass' };
  }

  // auto mode: classify risk
  if (ctx.permissionMode === 'auto') {
    return isLowRisk(ctx.toolName) ? { kind: 'auto_approve' } : { kind: 'prompt' };
  }

  // default mode: always prompt
  return { kind: 'prompt' };
}
