import { describe, it, expect } from 'bun:test';
import { resolvePermissionAction, type PermissionContext } from './engine.js';
import type { Capabilities } from '../harness/adapter.js';

const createContext = (overrides?: Partial<PermissionContext>): PermissionContext => ({
  capabilities: {
    interactiveApproval: true,
    planApproval: false,
    multipleChoice: false,
    compaction: false,
    costEvents: false,
  },
  permissionMode: 'default',
  toolName: 'TestTool',
  toolInput: '',
  ...overrides,
});

describe('resolvePermissionAction', () => {
  describe('interactiveApproval: false', () => {
    it('should return inform_only regardless of mode or tool', () => {
      const ctx = createContext({
        capabilities: {
          interactiveApproval: false,
          planApproval: false,
          multipleChoice: false,
          compaction: false,
          costEvents: false,
        },
        permissionMode: 'bypass',
        toolName: 'Bash',
      });

      const action = resolvePermissionAction(ctx);
      expect(action.kind).toBe('inform_only');
      if (action.kind === 'inform_only') {
        expect(action.message).toContain('Bash');
        expect(action.message).toContain('bypass');
      }
    });

    it('should include tool name in message', () => {
      const ctx = createContext({
        capabilities: { interactiveApproval: false, planApproval: false, multipleChoice: false, compaction: false, costEvents: false },
        toolName: 'CustomTool',
      });

      const action = resolvePermissionAction(ctx);
      expect(action.kind).toBe('inform_only');
      if (action.kind === 'inform_only') {
        expect(action.message).toContain('CustomTool');
      }
    });
  });

  describe('bypass mode', () => {
    it('should return bypass when mode is bypass and interactiveApproval is true', () => {
      const ctx = createContext({
        permissionMode: 'bypass',
      });

      const action = resolvePermissionAction(ctx);
      expect(action.kind).toBe('bypass');
    });

    it('should return bypass for any tool in bypass mode', () => {
      const ctx = createContext({
        permissionMode: 'bypass',
        toolName: 'Bash',
      });

      const action = resolvePermissionAction(ctx);
      expect(action.kind).toBe('bypass');
    });
  });

  describe('auto mode', () => {
    it('should return auto_approve for low-risk tools', () => {
      const ctx = createContext({
        permissionMode: 'auto',
        toolName: 'Read',
      });

      const action = resolvePermissionAction(ctx);
      expect(action.kind).toBe('auto_approve');
    });

    it('should return auto_approve for WebSearch', () => {
      const ctx = createContext({
        permissionMode: 'auto',
        toolName: 'WebSearch',
      });

      const action = resolvePermissionAction(ctx);
      expect(action.kind).toBe('auto_approve');
    });

    it('should return auto_approve for git_log', () => {
      const ctx = createContext({
        permissionMode: 'auto',
        toolName: 'git_log',
      });

      const action = resolvePermissionAction(ctx);
      expect(action.kind).toBe('auto_approve');
    });

    it('should return prompt for high-risk tools', () => {
      const ctx = createContext({
        permissionMode: 'auto',
        toolName: 'Bash',
      });

      const action = resolvePermissionAction(ctx);
      expect(action.kind).toBe('prompt');
    });

    it('should return prompt for Edit', () => {
      const ctx = createContext({
        permissionMode: 'auto',
        toolName: 'Edit',
      });

      const action = resolvePermissionAction(ctx);
      expect(action.kind).toBe('prompt');
    });

    it('should return prompt for tools with write pattern', () => {
      const ctx = createContext({
        permissionMode: 'auto',
        toolName: 'WriteFile',
      });

      const action = resolvePermissionAction(ctx);
      expect(action.kind).toBe('prompt');
    });
  });

  describe('default mode', () => {
    it('should always return prompt for default mode', () => {
      const ctx = createContext({
        permissionMode: 'default',
        toolName: 'Read',
      });

      const action = resolvePermissionAction(ctx);
      expect(action.kind).toBe('prompt');
    });

    it('should return prompt for high-risk tools in default mode', () => {
      const ctx = createContext({
        permissionMode: 'default',
        toolName: 'Bash',
      });

      const action = resolvePermissionAction(ctx);
      expect(action.kind).toBe('prompt');
    });

    it('should return prompt for any tool in default mode', () => {
      const ctx = createContext({
        permissionMode: 'default',
        toolName: 'AnyTool',
      });

      const action = resolvePermissionAction(ctx);
      expect(action.kind).toBe('prompt');
    });
  });
});
