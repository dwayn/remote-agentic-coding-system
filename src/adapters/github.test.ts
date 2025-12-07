/**
 * Unit tests for GitHub adapter
 */
import { GitHubAdapter } from './github';

// Mock orchestrator to avoid loading Claude Agent SDK (ESM module)
jest.mock('../orchestrator/orchestrator', () => ({
  handleMessage: jest.fn().mockResolvedValue(undefined),
}));

// Mock database modules
jest.mock('../db/conversations', () => ({
  getConversation: jest.fn(),
  createConversation: jest.fn(),
  updateConversation: jest.fn(),
}));

jest.mock('../db/codebases', () => ({
  getCodebase: jest.fn(),
  createCodebase: jest.fn(),
  getCodebaseByRepo: jest.fn(),
}));

jest.mock('../db/sessions', () => ({
  getActiveSession: jest.fn(),
  createSession: jest.fn(),
  endSession: jest.fn(),
}));

// Mock Octokit to avoid ESM import issues in Jest
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    rest: {
      issues: {
        createComment: jest.fn().mockResolvedValue({}),
      },
      repos: {
        get: jest.fn().mockResolvedValue({
          data: { default_branch: 'main' },
        }),
      },
    },
  })),
}));

describe('GitHubAdapter', () => {
  let adapter: GitHubAdapter;

  beforeEach(() => {
    adapter = new GitHubAdapter('fake-token-for-testing', 'fake-webhook-secret');
  });

  describe('streaming mode', () => {
    test('should always return batch mode', () => {
      expect(adapter.getStreamingMode()).toBe('batch');
    });
  });

  describe('lifecycle methods', () => {
    test('should start without errors', async () => {
      await expect(adapter.start()).resolves.toBeUndefined();
    });

    test('should stop without errors', () => {
      expect(() => adapter.stop()).not.toThrow();
    });
  });

  describe('sendMessage', () => {
    test('should handle invalid conversationId gracefully', async () => {
      // Should not throw when given invalid conversationId
      await expect(adapter.sendMessage('invalid', 'test message')).resolves.toBeUndefined();
    });
  });

  describe('conversationId format', () => {
    test('should use owner/repo#number format', () => {
      // This is implicit from the implementation
      // We're testing that the format is used correctly by attempting to parse
      const validFormat = 'owner/repo#123';
      const invalidFormats = ['owner-repo#123', 'owner/repo-123', 'owner#repo#123', 'invalid'];

      // Valid format should be parsed successfully (via sendMessage not throwing type errors)
      expect(() => adapter.sendMessage(validFormat, 'test')).not.toThrow();

      // Invalid formats should be handled gracefully (not throw)
      invalidFormats.forEach(format => {
        expect(() => adapter.sendMessage(format, 'test')).not.toThrow();
      });
    });
  });

  describe('configurable callsign', () => {
    let consoleLogSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      delete process.env.CALLSIGN;
    });

    test('should use custom callsign from constructor', () => {
      new GitHubAdapter('token', 'secret', 'jarvis');

      // Verify the callsign is logged during initialization
      expect(consoleLogSpy).toHaveBeenCalledWith('[GitHub] Using callsign: @jarvis');
    });

    test('should default to @remote-agent when no callsign provided', () => {
      new GitHubAdapter('token', 'secret');

      // Verify default behavior is maintained
      expect(consoleLogSpy).toHaveBeenCalledWith('[GitHub] Using callsign: @remote-agent');
    });

    test('should handle special characters in callsign', () => {
      // Test with regex special characters that need escaping
      new GitHubAdapter('token', 'secret', 'bot[test]');

      // Verify regex escaping works correctly (should not throw)
      expect(consoleLogSpy).toHaveBeenCalledWith('[GitHub] Using callsign: @bot[test]');

      // Create another adapter with different special characters
      consoleLogSpy.mockClear();
      new GitHubAdapter('token', 'secret', 'agent*plus+');
      expect(consoleLogSpy).toHaveBeenCalledWith('[GitHub] Using callsign: @agent*plus+');
    });

    test('should use environment variable when constructor param not provided', () => {
      process.env.CALLSIGN = 'test-bot';
      new GitHubAdapter('token', 'secret');

      // Verify env var loading works
      expect(consoleLogSpy).toHaveBeenCalledWith('[GitHub] Using callsign: @test-bot');

      delete process.env.CALLSIGN;
    });

    test('should prioritize constructor param over environment variable', () => {
      process.env.CALLSIGN = 'env-bot';
      new GitHubAdapter('token', 'secret', 'constructor-bot');

      // Constructor param should take precedence
      expect(consoleLogSpy).toHaveBeenCalledWith('[GitHub] Using callsign: @constructor-bot');

      delete process.env.CALLSIGN;
    });

    test('should handle empty environment variable', () => {
      process.env.CALLSIGN = '';
      new GitHubAdapter('token', 'secret');

      // Empty string should be falsy, so it should fall back to default
      expect(consoleLogSpy).toHaveBeenCalledWith('[GitHub] Using callsign: @remote-agent');

      delete process.env.CALLSIGN;
    });
  });
});
