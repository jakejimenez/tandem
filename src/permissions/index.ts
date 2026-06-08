/**
 * Permissions Module
 *
 * Capability-aware permission engine and risk classifier.
 */

export { resolvePermissionAction, type PermissionContext, type PermissionAction } from './engine.js';
export { isLowRisk } from './classifier.js';
