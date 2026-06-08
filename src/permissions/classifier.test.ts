import { describe, it, expect } from 'bun:test';
import { isLowRisk } from './classifier.js';

describe('isLowRisk', () => {
  describe('low-risk tools', () => {
    it('should classify Read as low-risk', () => {
      expect(isLowRisk('Read')).toBe(true);
    });

    it('should classify Glob as low-risk', () => {
      expect(isLowRisk('Glob')).toBe(true);
    });

    it('should classify Grep as low-risk', () => {
      expect(isLowRisk('Grep')).toBe(true);
    });

    it('should classify WebSearch as low-risk', () => {
      expect(isLowRisk('WebSearch')).toBe(true);
    });

    it('should classify WebFetch as low-risk', () => {
      expect(isLowRisk('WebFetch')).toBe(true);
    });

    it('should classify git_status as low-risk', () => {
      expect(isLowRisk('git_status')).toBe(true);
    });

    it('should classify git_log as low-risk', () => {
      expect(isLowRisk('git_log')).toBe(true);
    });

    it('should classify git_diff as low-risk', () => {
      expect(isLowRisk('git_diff')).toBe(true);
    });

    it('should classify git_show as low-risk', () => {
      expect(isLowRisk('git_show')).toBe(true);
    });

    it('should classify list_directory as low-risk', () => {
      expect(isLowRisk('list_directory')).toBe(true);
    });

    it('should classify LSP as low-risk', () => {
      expect(isLowRisk('LSP')).toBe(true);
    });
  });

  describe('high-risk tools', () => {
    it('should classify Bash as high-risk', () => {
      expect(isLowRisk('Bash')).toBe(false);
    });

    it('should classify Edit as high-risk', () => {
      expect(isLowRisk('Edit')).toBe(false);
    });

    it('should classify Write as high-risk', () => {
      expect(isLowRisk('Write')).toBe(false);
    });

    it('should classify shell as high-risk', () => {
      expect(isLowRisk('shell')).toBe(false);
    });

    it('should classify git_commit as high-risk', () => {
      expect(isLowRisk('git_commit')).toBe(false);
    });

    it('should classify git_push as high-risk', () => {
      expect(isLowRisk('git_push')).toBe(false);
    });

    it('should classify npm_install as high-risk', () => {
      expect(isLowRisk('npm_install')).toBe(false);
    });

    it('should classify DeleteFile as high-risk', () => {
      expect(isLowRisk('DeleteFile')).toBe(false);
    });

    it('should classify CreateFile as high-risk', () => {
      expect(isLowRisk('CreateFile')).toBe(false);
    });

    it('should classify remove_directory as high-risk', () => {
      expect(isLowRisk('remove_directory')).toBe(false);
    });

    it('should classify exec_command as high-risk', () => {
      expect(isLowRisk('exec_command')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should be case-insensitive for high-risk patterns', () => {
      expect(isLowRisk('BASH')).toBe(false);
      expect(isLowRisk('bash')).toBe(false);
      expect(isLowRisk('BaSh')).toBe(false);
    });

    it('should handle tools with multiple risk indicators', () => {
      expect(isLowRisk('edit_and_create')).toBe(false);
    });

    it('should classify unknown neutral tools as low-risk', () => {
      expect(isLowRisk('UnknownTool')).toBe(true);
    });
  });
});
