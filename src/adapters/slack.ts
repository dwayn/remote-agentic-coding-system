/**
 * Slack platform adapter using Bolt SDK with Socket Mode
 * Handles channels, DMs, and threads with workspace isolation support
 */
import { App } from '@slack/bolt';
import { IPlatformAdapter } from '../types';
import { handleMessage } from '../orchestrator/orchestrator';
import * as db from '../db/conversations';
import { setupWorkspaceIsolation, parseWorkspaceInput } from '../handlers/workspace-handler';
import { ConversationLockManager } from '../utils/conversation-lock';

interface ParsedConversationId {
  type: 'dm' | 'channel' | 'thread';
  teamId: string;
  channelId?: string;
  userId?: string;
  threadTs?: string;
}

export class SlackAdapter implements IPlatformAdapter {
  private app: App;
  private streamingMode: 'stream' | 'batch';
  private requireMentionInChannels: boolean;
  private requireMentionInThreads: boolean;
  private botUserId: string | null = null;
  private pendingWorkspaceSetup: Set<string> = new Set();
  private threadsWithBotMention: Set<string> = new Set();
  private lockManager: ConversationLockManager | null = null;

  constructor(
    botToken: string,
    appToken: string,
    signingSecret: string,
    mode: 'stream' | 'batch' = 'stream'
  ) {
    // Initialize Slack Bolt app with Socket Mode
    this.app = new App({
      token: botToken,
      appToken: appToken,
      signingSecret: signingSecret,
      socketMode: true,
    });

    this.streamingMode = mode;
    this.requireMentionInChannels =
      process.env.SLACK_REQUIRE_MENTION_IN_CHANNELS !== 'false';
    this.requireMentionInThreads =
      process.env.SLACK_REQUIRE_MENTION_IN_THREADS === 'true';

    console.log(`[Slack] Adapter initialized (mode: ${mode})`);
    console.log(`[Slack] Require mention in channels: ${this.requireMentionInChannels}`);
    console.log(`[Slack] Require mention in threads: ${this.requireMentionInThreads}`);
  }

  /**
   * Send a message to a Slack conversation
   * Handles Slack's 3000 character limit with message splitting
   */
  async sendMessage(conversationId: string, message: string): Promise<void> {
    const parsed = this.parseConversationId(conversationId);
    if (!parsed) {
      console.error('[Slack] Invalid conversationId:', conversationId);
      return;
    }

    const MAX_LENGTH = 3000;
    const chunks = this.splitMessage(message, MAX_LENGTH);

    try {
      for (const chunk of chunks) {
        const params: any = {
          channel: parsed.channelId || parsed.userId!,
          text: chunk,
        };

        // Add thread_ts if this is a thread
        if (parsed.threadTs) {
          params.thread_ts = parsed.threadTs;
        }

        await this.app.client.chat.postMessage(params);
      }
    } catch (error) {
      console.error('[Slack] Failed to send message:', { error, conversationId });
    }
  }

  /**
   * Split message into chunks respecting Slack's character limit
   * Preserves formatting by splitting on line boundaries
   */
  private splitMessage(message: string, maxLength: number): string[] {
    if (message.length <= maxLength) {
      return [message];
    }

    const lines = message.split('\n');
    const chunks: string[] = [];
    let currentChunk = '';

    for (const line of lines) {
      // Reserve 100 chars for safety margin
      if (currentChunk.length + line.length + 1 > maxLength - 100) {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        currentChunk = line;
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
    }

    // Add remaining chunk
    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Get the configured streaming mode
   */
  getStreamingMode(): 'stream' | 'batch' {
    return this.streamingMode;
  }

  /**
   * Get platform type identifier
   */
  getPlatformType(): string {
    return 'slack';
  }

  /**
   * Fetch bot user ID for mention detection
   */
  private async fetchBotUserId(): Promise<void> {
    try {
      const result = await this.app.client.auth.test();
      this.botUserId = result.user_id as string;
      console.log(`[Slack] Bot user ID: ${this.botUserId}`);
    } catch (error) {
      console.error('[Slack] Failed to fetch bot user ID:', error);
      throw error;
    }
  }

  /**
   * Parse conversation ID into components
   */
  private parseConversationId(conversationId: string): ParsedConversationId | null {
    // DM format: "slack-dm:<team_id>:<user_id>"
    const dmMatch = /^slack-dm:([^:]+):([^:]+)$/.exec(conversationId);
    if (dmMatch) {
      return {
        type: 'dm',
        teamId: dmMatch[1],
        userId: dmMatch[2],
      };
    }

    // Thread format: "slack:<team_id>:<channel_id>:<thread_ts>"
    const threadMatch = /^slack:([^:]+):([^:]+):([^:]+)$/.exec(conversationId);
    if (threadMatch) {
      return {
        type: 'thread',
        teamId: threadMatch[1],
        channelId: threadMatch[2],
        threadTs: threadMatch[3],
      };
    }

    // Channel format: "slack:<team_id>:<channel_id>"
    const channelMatch = /^slack:([^:]+):([^:]+)$/.exec(conversationId);
    if (channelMatch) {
      return {
        type: 'channel',
        teamId: channelMatch[1],
        channelId: channelMatch[2],
      };
    }

    return null;
  }

  /**
   * Build conversation ID from components
   */
  private buildConversationId(
    teamId: string,
    channelId?: string,
    userId?: string,
    threadTs?: string
  ): string {
    if (userId && !channelId) {
      // DM
      return `slack-dm:${teamId}:${userId}`;
    } else if (threadTs) {
      // Thread
      return `slack:${teamId}:${channelId}:${threadTs}`;
    } else {
      // Channel
      return `slack:${teamId}:${channelId}`;
    }
  }


  /**
   * Check if message should trigger a response
   */
  private shouldRespond(
    text: string,
    isDM: boolean,
    isThread: boolean,
    threadTs?: string,
    teamId?: string,
    channelId?: string
  ): boolean {
    // Always respond in DMs
    if (isDM) return true;

    // Check for bot mention
    const hasMention = !!this.botUserId && text.includes(`<@${this.botUserId}>`);

    // In channels: require mention (unless configured otherwise)
    if (!isThread) {
      return this.requireMentionInChannels ? hasMention : true;
    }

    // In threads: check configuration
    if (this.requireMentionInThreads) {
      return hasMention;
    }

    // Check if parent had bot mention
    if (threadTs && teamId && channelId) {
      const threadKey = `${teamId}:${channelId}:${threadTs}`;
      if (this.threadsWithBotMention.has(threadKey)) {
        return true;
      }
    }

    // Fallback to mention requirement
    return hasMention;
  }

  /**
   * Strip bot mention from text
   */
  private stripMention(text: string): string {
    if (!this.botUserId) return text;

    return text.replace(new RegExp(`<@${this.botUserId}>`, 'g'), '').trim();
  }

  /**
   * Handle bot joined channel event
   */
  private async handleBotJoinedChannel(event: any): Promise<void> {
    // Only handle if the bot was the one who joined
    if (event.user !== this.botUserId) return;

    const teamId = event.team || 'unknown';
    const channelId = event.channel;

    // Post welcome message asking for workspace isolation name
    const welcomeMessage =
      `👋 Hello! I'm your remote coding assistant.\n\n` +
      `To get started, please tell me what to name the workspace for this channel.\n\n` +
      `**Options:**\n` +
      `• Reply with a name (e.g., "my-project") to create an isolated workspace\n` +
      `• Reply with \`""\` (empty string) to use the global workspace\n\n` +
      `The workspace name will be used to organize files for this channel.`;

    try {
      await this.app.client.chat.postMessage({
        channel: channelId,
        text: welcomeMessage,
      });

      // Track that this channel is awaiting workspace setup
      const conversationId = this.buildConversationId(teamId, channelId);
      this.pendingWorkspaceSetup.add(conversationId);

      console.log(`[Slack] Bot joined channel ${channelId}, sent workspace setup message`);
    } catch (error) {
      console.error('[Slack] Failed to send welcome message:', error);
    }
  }

  /**
   * Handle workspace setup for a new channel
   */
  private async handleWorkspaceSetup(
    conversationId: string,
    input: string,
    channelId: string
  ): Promise<void> {
    try {
      const isolationName = parseWorkspaceInput(input);
      const workspacePath = await setupWorkspaceIsolation(isolationName);

      // Create conversation with workspace isolation
      const conversation = await db.getOrCreateConversation('slack', conversationId);

      await db.updateConversation(conversation.id, {
        workspace_isolation: isolationName,
        cwd: workspacePath,
      });

      this.pendingWorkspaceSetup.delete(conversationId);

      const message = isolationName
        ? `✅ Workspace configured: \`${isolationName}\`\n\nFiles will be stored in: \`${workspacePath}\`\n\nYou can now use commands like \`/clone\` or ask me questions!`
        : `✅ Using global workspace\n\nFiles will be stored in: \`${workspacePath}\`\n\nYou can now use commands like \`/clone\` or ask me questions!`;

      await this.app.client.chat.postMessage({
        channel: channelId,
        text: message,
      });

      console.log(`[Slack] Workspace setup complete for ${conversationId}: ${isolationName || 'global'}`);
    } catch (error) {
      const err = error as Error;
      await this.app.client.chat.postMessage({
        channel: channelId,
        text: `❌ Invalid workspace name: ${err.message}\n\nPlease try again with a valid name or \`""\` for global workspace.`,
      });
      console.error('[Slack] Workspace setup failed:', error);
    }
  }

  /**
   * Ensure thread inherits parent channel workspace
   */
  private async ensureThreadInheritance(
    conversationId: string,
    teamId: string,
    channelId: string
  ): Promise<void> {
    const conversation = await db.getOrCreateConversation('slack', conversationId);

    // If thread already has workspace configured, skip
    if (conversation.workspace_isolation !== undefined && conversation.cwd) {
      return;
    }

    // Get parent channel conversation
    const parentConversationId = this.buildConversationId(teamId, channelId);
    const parentConversation = await db.getOrCreateConversation('slack', parentConversationId);

    // Inherit parent's workspace isolation and cwd
    if (parentConversation.workspace_isolation || parentConversation.cwd) {
      await db.updateConversation(conversation.id, {
        workspace_isolation: parentConversation.workspace_isolation,
        cwd: parentConversation.cwd,
      });

      console.log(
        `[Slack] Thread inherited workspace from parent: ${parentConversation.workspace_isolation || 'global'}`
      );
    }
  }

  /**
   * Handle incoming message
   */
  private async handleIncomingMessage(message: any): Promise<void> {
    // Skip bot messages
    if (message.bot_id) return;

    // Extract message details
    const teamId = message.team || 'unknown';
    const channelId = message.channel;
    const userId = message.user;
    const text = message.text || '';
    const threadTs = message.thread_ts;
    const ts = message.ts;

    // Determine conversation type
    const isDM = channelId.startsWith('D');
    const isThread = !!threadTs;

    // Build conversation ID
    let conversationId: string;
    if (isDM) {
      conversationId = this.buildConversationId(teamId, undefined, userId);
    } else if (isThread) {
      conversationId = this.buildConversationId(teamId, channelId, undefined, threadTs);
    } else {
      conversationId = this.buildConversationId(teamId, channelId);
    }

    // Track if this is a new thread starter with bot mention
    if (!isDM && !isThread && this.botUserId && text.includes(`<@${this.botUserId}>`)) {
      const threadKey = `${teamId}:${channelId}:${ts}`;
      this.threadsWithBotMention.add(threadKey);
    }

    // Check if channel is awaiting workspace setup
    if (!isDM && !isThread && this.pendingWorkspaceSetup.has(conversationId)) {
      await this.handleWorkspaceSetup(conversationId, text, channelId);
      return;
    }

    // Check mention requirements
    if (!this.shouldRespond(text, isDM, isThread, threadTs, teamId, channelId)) {
      return;
    }

    // Ensure thread inherits parent workspace
    if (isThread && !isDM) {
      await this.ensureThreadInheritance(conversationId, teamId, channelId);
    }

    // Strip mention from text
    const cleanText = this.stripMention(text);

    // Route to orchestrator with lock
    if (!this.lockManager) {
      console.error('[Slack] Lock manager not initialized');
      return;
    }

    await this.lockManager.acquireLock(conversationId, async () => {
      await handleMessage(this, conversationId, cleanText);
    });
  }

  /**
   * Set up event handlers
   * Must be called after lock manager is available
   */
  public setupEventHandlers(lockManager: ConversationLockManager): void {
    this.lockManager = lockManager;

    // Handle regular messages (DMs and channels)
    this.app.message(async ({ message }) => {
      await this.handleIncomingMessage(message);
    });

    // Handle app mentions in channels
    this.app.event('app_mention', async ({ event }) => {
      await this.handleIncomingMessage(event);
    });

    // Handle member_joined_channel (bot added to channel)
    this.app.event('member_joined_channel', async ({ event }) => {
      await this.handleBotJoinedChannel(event);
    });

    console.log('[Slack] Event handlers registered');
  }

  /**
   * Start the Slack adapter
   */
  async start(): Promise<void> {
    // Fetch bot user ID
    await this.fetchBotUserId();

    // Start the app (Socket Mode)
    await this.app.start();

    console.log('[Slack] Bot started (Socket Mode)');
  }

  /**
   * Stop the Slack adapter gracefully
   */
  stop(): void {
    this.app.stop();
    console.log('[Slack] Bot stopped');
  }

  /**
   * Get the Slack Bolt app instance
   */
  getApp(): App {
    return this.app;
  }
}
