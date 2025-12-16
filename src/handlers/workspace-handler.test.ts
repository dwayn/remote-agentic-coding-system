/**
 * Unit tests for workspace handler
 */
import { parseWorkspaceInput } from './workspace-handler';

describe('workspace-handler', () => {
  describe('parseWorkspaceInput', () => {
    it('should return null for double-quoted empty string', () => {
      const result = parseWorkspaceInput('""');
      expect(result).toBeNull();
    });

    it('should return null for single-quoted empty string', () => {
      const result = parseWorkspaceInput("''");
      expect(result).toBeNull();
    });

    it('should return null for actual empty input', () => {
      const result = parseWorkspaceInput('');
      expect(result).toBeNull();
    });

    it('should return null for whitespace-only input', () => {
      const result = parseWorkspaceInput('   ');
      expect(result).toBeNull();
    });

    it('should accept valid alphanumeric workspace name', () => {
      const result = parseWorkspaceInput('myproject');
      expect(result).toBe('myproject');
    });

    it('should accept workspace name with hyphens', () => {
      const result = parseWorkspaceInput('my-project');
      expect(result).toBe('my-project');
    });

    it('should accept workspace name with underscores', () => {
      const result = parseWorkspaceInput('my_project');
      expect(result).toBe('my_project');
    });

    it('should accept workspace name with numbers', () => {
      const result = parseWorkspaceInput('project123');
      expect(result).toBe('project123');
    });

    it('should accept mixed valid characters', () => {
      const result = parseWorkspaceInput('My-Project_123');
      expect(result).toBe('My-Project_123');
    });

    it('should trim whitespace from input', () => {
      const result = parseWorkspaceInput('  my-project  ');
      expect(result).toBe('my-project');
    });

    it('should throw error for invalid characters (slash)', () => {
      expect(() => parseWorkspaceInput('my/project')).toThrow(
        'Workspace name must contain only letters, numbers, hyphens, and underscores'
      );
    });

    it('should throw error for invalid characters (space)', () => {
      expect(() => parseWorkspaceInput('my project')).toThrow(
        'Workspace name must contain only letters, numbers, hyphens, and underscores'
      );
    });

    it('should throw error for invalid characters (dot)', () => {
      expect(() => parseWorkspaceInput('my.project')).toThrow(
        'Workspace name must contain only letters, numbers, hyphens, and underscores'
      );
    });

    it('should throw error for invalid characters (special chars)', () => {
      expect(() => parseWorkspaceInput('my@project!')).toThrow(
        'Workspace name must contain only letters, numbers, hyphens, and underscores'
      );
    });
  });
});
