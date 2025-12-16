/**
 * Unit tests for Slack adapter
 */
import { SlackAdapter } from './slack';

describe('SlackAdapter', () => {
  describe('Conversation ID parsing', () => {
    let adapter: SlackAdapter;

    beforeEach(() => {
      adapter = new SlackAdapter('xoxb-test', 'xapp-test', 'test-secret', 'batch');
    });

    it('should parse DM conversation ID correctly', () => {
      const conversationId = 'slack-dm:T123:U456';
      const parsed = (adapter as any).parseConversationId(conversationId);

      expect(parsed).toEqual({
        type: 'dm',
        teamId: 'T123',
        userId: 'U456',
      });
    });

    it('should parse channel conversation ID correctly', () => {
      const conversationId = 'slack:T123:C456';
      const parsed = (adapter as any).parseConversationId(conversationId);

      expect(parsed).toEqual({
        type: 'channel',
        teamId: 'T123',
        channelId: 'C456',
      });
    });

    it('should parse thread conversation ID correctly', () => {
      const conversationId = 'slack:T123:C456:1234567890.123456';
      const parsed = (adapter as any).parseConversationId(conversationId);

      expect(parsed).toEqual({
        type: 'thread',
        teamId: 'T123',
        channelId: 'C456',
        threadTs: '1234567890.123456',
      });
    });

    it('should return null for invalid conversation ID', () => {
      const conversationId = 'invalid-format';
      const parsed = (adapter as any).parseConversationId(conversationId);

      expect(parsed).toBeNull();
    });
  });

  describe('Conversation ID building', () => {
    let adapter: SlackAdapter;

    beforeEach(() => {
      adapter = new SlackAdapter('xoxb-test', 'xapp-test', 'test-secret', 'batch');
    });

    it('should build DM conversation ID correctly', () => {
      const conversationId = (adapter as any).buildConversationId('T123', undefined, 'U456');

      expect(conversationId).toBe('slack-dm:T123:U456');
    });

    it('should build channel conversation ID correctly', () => {
      const conversationId = (adapter as any).buildConversationId('T123', 'C456');

      expect(conversationId).toBe('slack:T123:C456');
    });

    it('should build thread conversation ID correctly', () => {
      const conversationId = (adapter as any).buildConversationId(
        'T123',
        'C456',
        undefined,
        '1234567890.123456'
      );

      expect(conversationId).toBe('slack:T123:C456:1234567890.123456');
    });
  });

  describe('Message splitting', () => {
    let adapter: SlackAdapter;

    beforeEach(() => {
      adapter = new SlackAdapter('xoxb-test', 'xapp-test', 'test-secret', 'batch');
    });

    it('should not split short messages', () => {
      const message = 'Short message';
      const chunks = (adapter as any).splitMessage(message, 3000);

      expect(chunks).toEqual([message]);
    });

    it('should split long messages by lines', () => {
      const lines = Array(200)
        .fill('x')
        .map((_, i) => `Line ${i}`)
        .join('\n');
      const chunks = (adapter as any).splitMessage(lines, 300);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((chunk: string) => {
        expect(chunk.length).toBeLessThanOrEqual(300);
      });
    });

    it('should preserve line breaks in chunks', () => {
      const message = 'Line 1\nLine 2\nLine 3';
      const chunks = (adapter as any).splitMessage(message, 3000);

      expect(chunks).toEqual([message]);
      expect(chunks[0]).toContain('\n');
    });
  });

  describe('Mention detection', () => {
    let adapter: SlackAdapter;

    beforeEach(() => {
      adapter = new SlackAdapter('xoxb-test', 'xapp-test', 'test-secret', 'batch');
      (adapter as any).botUserId = 'U123BOT';
    });

    it('should always respond in DMs', () => {
      const shouldRespond = (adapter as any).shouldRespond('Hello', true, false);

      expect(shouldRespond).toBe(true);
    });

    it('should require mention in channels when configured', () => {
      (adapter as any).requireMentionInChannels = true;

      const withMention = (adapter as any).shouldRespond('<@U123BOT> hello', false, false);
      const withoutMention = (adapter as any).shouldRespond('hello', false, false);

      expect(withMention).toBe(true);
      expect(withoutMention).toBe(false);
    });

    it('should not require mention in channels when configured', () => {
      (adapter as any).requireMentionInChannels = false;

      const shouldRespond = (adapter as any).shouldRespond('hello', false, false);

      expect(shouldRespond).toBe(true);
    });

    it('should handle thread mention requirements', () => {
      (adapter as any).requireMentionInThreads = true;

      const withMention = (adapter as any).shouldRespond(
        '<@U123BOT> hello',
        false,
        true,
        '123.456',
        'T123',
        'C456'
      );
      const withoutMention = (adapter as any).shouldRespond(
        'hello',
        false,
        true,
        '123.456',
        'T123',
        'C456'
      );

      expect(withMention).toBe(true);
      expect(withoutMention).toBe(false);
    });

    it('should respond in threads with parent mention tracking', () => {
      (adapter as any).requireMentionInThreads = false;
      (adapter as any).threadsWithBotMention.add('T123:C456:123.456');

      const shouldRespond = (adapter as any).shouldRespond(
        'hello',
        false,
        true,
        '123.456',
        'T123',
        'C456'
      );

      expect(shouldRespond).toBe(true);
    });
  });

  describe('Mention stripping', () => {
    let adapter: SlackAdapter;

    beforeEach(() => {
      adapter = new SlackAdapter('xoxb-test', 'xapp-test', 'test-secret', 'batch');
      (adapter as any).botUserId = 'U123BOT';
    });

    it('should strip bot mention from text', () => {
      const text = '<@U123BOT> hello world';
      const stripped = (adapter as any).stripMention(text);

      expect(stripped).toBe('hello world');
    });

    it('should strip multiple mentions', () => {
      const text = '<@U123BOT> hello <@U123BOT> world';
      const stripped = (adapter as any).stripMention(text);

      expect(stripped).toBe('hello  world');
    });

    it('should handle text without mentions', () => {
      const text = 'hello world';
      const stripped = (adapter as any).stripMention(text);

      expect(stripped).toBe('hello world');
    });

    it('should return original text if botUserId not set', () => {
      (adapter as any).botUserId = null;
      const text = '<@U123BOT> hello';
      const stripped = (adapter as any).stripMention(text);

      expect(stripped).toBe(text);
    });
  });

  describe('Platform type and streaming mode', () => {
    it('should return correct platform type', () => {
      const adapter = new SlackAdapter('xoxb-test', 'xapp-test', 'test-secret');

      expect(adapter.getPlatformType()).toBe('slack');
    });

    it('should default to stream mode', () => {
      const adapter = new SlackAdapter('xoxb-test', 'xapp-test', 'test-secret');

      expect(adapter.getStreamingMode()).toBe('stream');
    });

    it('should respect batch mode configuration', () => {
      const adapter = new SlackAdapter('xoxb-test', 'xapp-test', 'test-secret', 'batch');

      expect(adapter.getStreamingMode()).toBe('batch');
    });
  });
});
