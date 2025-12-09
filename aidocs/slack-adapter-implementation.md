# Slack Adapter Implementation Plan

## Overview

This document outlines the phased implementation plan for adding Slack support to the remote-agentic-coding-system. The Slack adapter will support multiple conversation contexts (channels, DMs, threads) with workspace isolation and flexible mention requirements.

## Key Design Decisions

### Conversation Context Hierarchy
- **Direct Messages (DMs)**: Single persistent conversation per user
- **Channels**: Channel-wide conversation with optional workspace isolation
- **Threads**: Independent conversation within a thread, inheriting parent channel's workspace isolation but allowing override

### Workspace Isolation Strategy
- Global workspace root: Configured via `WORKSPACE_PATH` (default: `./workspace`)
- Channel isolation: Optional named isolation contexts in `./workspace/.isolated/<name>/`
- Default behavior: Empty string `""` uses global workspace directly
- Named isolation: Creates `./workspace/.isolated/<isolation-name>/` for channel-specific work
- Thread override: Threads can set their own CWD within their inherited isolation context

### Conversation ID Format
- **Channels**: `slack:<team_id>:<channel_id>`
- **Threads**: `slack:<team_id>:<channel_id>:<thread_ts>`
- **DMs**: `slack-dm:<team_id>:<user_id>`

All formats fit comfortably within the existing 255 character `platform_conversation_id` limit.

### Message Filtering & Mentions
- **DMs**: Respond to all messages (no @mention required)
- **Channels**: @mention required by default (configurable via `SLACK_REQUIRE_MENTION_IN_CHANNELS`)
- **Threads**: @mention NOT required by default if bot was mentioned in parent (configurable via `SLACK_REQUIRE_MENTION_IN_THREADS`)

### Streaming Mode
- Default: `stream` (real-time message updates)
- Configurable via: `SLACK_STREAMING_MODE` (options: `stream` | `batch`)

### Connection Mode
- **Socket Mode**: Real-time event handling without public webhooks (initial implementation)
- Future: Webhook mode support (noted for future enhancement)

---

## Database Schema Changes

### Migration: Add workspace isolation support

**File**: `migrations/002_add_workspace_isolation.sql`

```sql
-- Add workspace_isolation field to conversations table
-- This field stores the name of the isolation directory (e.g., "slack-fu")
-- NULL means use the global workspace directly
ALTER TABLE remote_agent_conversations
  ADD COLUMN workspace_isolation VARCHAR(255) DEFAULT NULL;

CREATE INDEX idx_remote_agent_conversations_isolation
  ON remote_agent_conversations(workspace_isolation);

-- Add comment for documentation
COMMENT ON COLUMN remote_agent_conversations.workspace_isolation IS
  'Optional isolation context name. If set, workspace becomes <WORKSPACE_PATH>/.isolated/<isolation>. NULL uses global workspace.';
```

### Updated Conversation Type

**File**: `src/types/index.ts`

Add `workspace_isolation` field to `Conversation` interface:
```typescript
export interface Conversation {
  id: string;
  platform_type: string;
  platform_conversation_id: string;
  codebase_id: string | null;
  cwd: string | null;
  workspace_isolation: string | null;  // NEW FIELD
  ai_assistant_type: string;
  created_at: Date;
  updated_at: Date;
}
```

---

## Implementation Phases

### Phase 1: Foundation & Dependencies

**Goal**: Set up Slack SDK, environment configuration, and basic adapter structure

#### Tasks:

1. **Install Slack Bolt SDK**
   ```bash
   npm install @slack/bolt
   npm install --save-dev @types/node  # May already be installed
   ```

2. **Update Environment Variables**

   **File**: `.env.example`

   Add Slack configuration section:
   ```env
   # ================================
   # Slack Configuration (Optional)
   # ================================

   # Required for Slack adapter
   SLACK_BOT_TOKEN=xoxb-your-bot-token-here
   SLACK_APP_TOKEN=xapp-your-app-token-here
   SLACK_SIGNING_SECRET=your-signing-secret-here

   # Streaming mode: stream (default) | batch
   SLACK_STREAMING_MODE=stream

   # Mention requirements
   # Require @mention in channels (default: true)
   SLACK_REQUIRE_MENTION_IN_CHANNELS=true

   # Require @mention in threads (default: false)
   # When false, bot responds to all messages in threads where it was mentioned in parent
   SLACK_REQUIRE_MENTION_IN_THREADS=false
   ```

3. **Create Database Migration**

   **File**: `migrations/002_add_workspace_isolation.sql`

   Create the migration file as specified in the Database Schema Changes section above.

4. **Update Conversation Database Module**

   **File**: `src/db/conversations.ts`

   - Add `workspace_isolation` to `updateConversation` function
   - Add helper function `getWorkspacePath()` to compute effective workspace path:
     ```typescript
     export function getWorkspacePath(
       conversation: Conversation,
       globalWorkspace: string = process.env.WORKSPACE_PATH || './workspace'
     ): string {
       if (conversation.workspace_isolation) {
         return join(globalWorkspace, '.isolated', conversation.workspace_isolation);
       }
       return globalWorkspace;
     }
     ```

5. **Update Types**

   **File**: `src/types/index.ts`

   Update `Conversation` interface as specified above.

**Testing**:
- Run migration against test database
- Verify `workspace_isolation` field exists and is nullable
- Test `getWorkspacePath()` with various isolation values

---

### Phase 2: Core Slack Adapter Implementation

**Goal**: Implement the Slack adapter with basic message sending/receiving

#### Tasks:

1. **Create Slack Adapter Class**

   **File**: `src/adapters/slack.ts`

   Implement `SlackAdapter` class with:

   ```typescript
   export class SlackAdapter implements IPlatformAdapter {
     private app: App;
     private streamingMode: 'stream' | 'batch';
     private requireMentionInChannels: boolean;
     private requireMentionInThreads: boolean;
     private botUserId: string | null = null;

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
     }

     async sendMessage(conversationId: string, message: string): Promise<void> {
       // Parse conversationId to extract channel/thread info
       // Handle Slack's 3000 char limit with message splitting
       // Post message to appropriate context (channel/thread/DM)
     }

     getStreamingMode(): 'stream' | 'batch' {
       return this.streamingMode;
     }

     getPlatformType(): string {
       return 'slack';
     }

     async start(): Promise<void> {
       // Fetch bot user ID for mention detection
       // Set up event listeners
       // Start the app
     }

     stop(): void {
       // Stop the app gracefully
     }

     getApp(): App {
       // Expose app for event handler registration
     }
   }
   ```

2. **Implement Conversation ID Parsing**

   Add helper methods to `SlackAdapter`:

   ```typescript
   private parseConversationId(conversationId: string): {
     type: 'dm' | 'channel' | 'thread';
     teamId: string;
     channelId?: string;
     userId?: string;
     threadTs?: string;
   } | null {
     // Parse "slack:<team>:<channel>" (channel)
     // Parse "slack:<team>:<channel>:<thread_ts>" (thread)
     // Parse "slack-dm:<team>:<user>" (DM)
   }

   private buildConversationId(
     teamId: string,
     channelId?: string,
     userId?: string,
     threadTs?: string
   ): string {
     // Build conversation ID from components
   }

   private getParentConversationId(threadConversationId: string): string | null {
     // Extract parent channel conversation ID from thread conversation ID
   }
   ```

3. **Implement Message Sending**

   Handle Slack's message constraints:
   - 3000 character limit per message (vs Telegram's 4096)
   - Split long messages by lines
   - Preserve thread context when replying
   - Handle both channel and DM sending

   ```typescript
   async sendMessage(conversationId: string, message: string): Promise<void> {
     const parsed = this.parseConversationId(conversationId);
     if (!parsed) {
       console.error('[Slack] Invalid conversationId:', conversationId);
       return;
     }

     const MAX_LENGTH = 3000;
     const chunks = this.splitMessage(message, MAX_LENGTH);

     for (const chunk of chunks) {
       const params: ChatPostMessageArguments = {
         channel: parsed.channelId || parsed.userId!,
         text: chunk,
       };

       // Add thread_ts if this is a thread
       if (parsed.threadTs) {
         params.thread_ts = parsed.threadTs;
       }

       await this.app.client.chat.postMessage(params);
     }
   }

   private splitMessage(message: string, maxLength: number): string[] {
     // Similar to Telegram adapter, split by lines to preserve formatting
   }
   ```

4. **Implement Bot User ID Fetching**

   ```typescript
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
   ```

**Testing**:
- Test conversation ID parsing and building
- Test message splitting logic
- Verify bot user ID is fetched correctly
- Unit tests for helper methods

---

### Phase 3: Event Handling & Message Routing

**Goal**: Implement event listeners and route messages to orchestrator

#### Tasks:

1. **Implement Event Handler Setup**

   **File**: `src/adapters/slack.ts`

   ```typescript
   private setupEventHandlers(lockManager: ConversationLockManager): void {
     // Handle regular messages (DMs and channels)
     this.app.message(async ({ message, say }) => {
       await this.handleMessage(message, lockManager);
     });

     // Handle app mentions in channels
     this.app.event('app_mention', async ({ event }) => {
       await this.handleMessage(event, lockManager);
     });

     // Handle member_joined_channel (bot added to channel)
     this.app.event('member_joined_channel', async ({ event }) => {
       await this.handleBotJoinedChannel(event);
     });
   }
   ```

2. **Implement Message Handler**

   ```typescript
   private async handleMessage(
     message: any,
     lockManager: ConversationLockManager
   ): Promise<void> {
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

     // Check mention requirements
     if (!this.shouldRespond(text, isDM, isThread, threadTs)) {
       return;
     }

     // Strip mention from text
     const cleanText = this.stripMention(text);

     // Route to orchestrator with lock
     await lockManager.acquireLock(conversationId, async () => {
       await handleMessage(this, conversationId, cleanText);
     });
   }
   ```

3. **Implement Mention Detection**

   ```typescript
   private shouldRespond(
     text: string,
     isDM: boolean,
     isThread: boolean,
     threadTs?: string
   ): boolean {
     // Always respond in DMs
     if (isDM) return true;

     // Check for bot mention
     const hasMention = this.botUserId && text.includes(`<@${this.botUserId}>`);

     // In channels: require mention (unless configured otherwise)
     if (!isThread) {
       return this.requireMentionInChannels ? hasMention : true;
     }

     // In threads: check configuration
     if (this.requireMentionInThreads) {
       return hasMention;
     }

     // If not requiring mention in threads, check if bot was mentioned in parent
     // For now, always respond in threads (we'll track parent mentions in Phase 4)
     return true;
   }

   private stripMention(text: string): string {
     if (!this.botUserId) return text;

     return text
       .replace(new RegExp(`<@${this.botUserId}>`, 'g'), '')
       .trim();
   }
   ```

4. **Implement Bot Joined Channel Handler**

   ```typescript
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

     await this.app.client.chat.postMessage({
       channel: channelId,
       text: welcomeMessage,
     });

     console.log(`[Slack] Bot joined channel ${channelId}, sent workspace setup message`);
   }
   ```

**Testing**:
- Test event handlers are registered correctly
- Test message routing for DMs, channels, and threads
- Test mention detection logic
- Test bot joined channel welcome message

---

### Phase 4: Workspace Isolation & Channel Setup

**Goal**: Implement workspace isolation and channel initialization flow

#### Tasks:

1. **Create Workspace Isolation Handler**

   **File**: `src/handlers/workspace-handler.ts`

   ```typescript
   import { mkdir } from 'fs/promises';
   import { join } from 'path';

   export async function setupWorkspaceIsolation(
     isolationName: string | null,
     globalWorkspace: string = process.env.WORKSPACE_PATH || './workspace'
   ): Promise<string> {
     if (!isolationName) {
       // Use global workspace
       return globalWorkspace;
     }

     // Create isolated workspace directory
     const isolatedPath = join(globalWorkspace, '.isolated', isolationName);

     try {
       await mkdir(isolatedPath, { recursive: true });
       console.log(`[Workspace] Created isolated workspace: ${isolatedPath}`);
       return isolatedPath;
     } catch (error) {
       console.error('[Workspace] Failed to create isolated workspace:', error);
       throw error;
     }
   }

   export function parseWorkspaceInput(input: string): string | null {
     const trimmed = input.trim();

     // Handle explicit empty string
     if (trimmed === '""' || trimmed === "''") {
       return null;
     }

     // Handle actual empty input
     if (!trimmed) {
       return null;
     }

     // Validate workspace name (alphanumeric, hyphens, underscores)
     const validName = /^[a-zA-Z0-9_-]+$/;
     if (!validName.test(trimmed)) {
       throw new Error(
         'Workspace name must contain only letters, numbers, hyphens, and underscores'
       );
     }

     return trimmed;
   }
   ```

2. **Track Pending Workspace Setup in Adapter**

   **File**: `src/adapters/slack.ts`

   Add state tracking for channels awaiting workspace setup:

   ```typescript
   export class SlackAdapter implements IPlatformAdapter {
     // ... existing fields ...
     private pendingWorkspaceSetup: Set<string> = new Set();

     private async handleBotJoinedChannel(event: any): Promise<void> {
       // ... existing code ...

       // Track that this channel is awaiting workspace setup
       const conversationId = this.buildConversationId(teamId, channelId);
       this.pendingWorkspaceSetup.add(conversationId);
     }

     private async handleMessage(
       message: any,
       lockManager: ConversationLockManager
     ): Promise<void> {
       // ... build conversationId ...

       // Check if channel is awaiting workspace setup
       if (!isDM && !isThread && this.pendingWorkspaceSetup.has(conversationId)) {
         await this.handleWorkspaceSetup(conversationId, cleanText, channelId);
         return;
       }

       // ... rest of message handling ...
     }

     private async handleWorkspaceSetup(
       conversationId: string,
       input: string,
       channelId: string
     ): Promise<void> {
       try {
         const isolationName = parseWorkspaceInput(input);
         const workspacePath = await setupWorkspaceIsolation(isolationName);

         // Create conversation with workspace isolation
         const conversation = await db.getOrCreateConversation(
           'slack',
           conversationId
         );

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
       } catch (error) {
         const err = error as Error;
         await this.app.client.chat.postMessage({
           channel: channelId,
           text: `❌ Invalid workspace name: ${err.message}\n\nPlease try again with a valid name or \`""\` for global workspace.`,
         });
       }
     }
   }
   ```

3. **Update Clone Command for Workspace Isolation**

   **File**: `src/handlers/command-handler.ts`

   Update `/clone` command to use workspace isolation:

   ```typescript
   case 'clone': {
     // ... existing validation ...

     // Get workspace path (respecting isolation)
     const workspacePath = db.getWorkspacePath(conversation);
     const targetPath = join(workspacePath, repoName);

     // ... rest of clone logic ...
   }
   ```

4. **Update Other Commands for Workspace Isolation**

   Update `/repos`, `/setcwd`, and other workspace-aware commands to use `getWorkspacePath()`.

**Testing**:
- Test workspace setup flow for new channels
- Test parsing of workspace names (valid, invalid, empty string)
- Test isolated directory creation
- Test that `/clone` uses correct workspace path
- Test thread workspace inheritance

---

### Phase 5: Thread Context Management

**Goal**: Implement proper thread handling with parent context inheritance

#### Tasks:

1. **Add Thread Parent Tracking**

   **File**: `src/adapters/slack.ts`

   Track which threads have bot mentions in parent message:

   ```typescript
   export class SlackAdapter implements IPlatformAdapter {
     // ... existing fields ...
     private threadsWithBotMention: Set<string> = new Set();

     private async handleMessage(
       message: any,
       lockManager: ConversationLockManager
     ): Promise<void> {
       // ... existing message extraction ...

       // Track if this is a new thread starter with bot mention
       if (!isThread && this.botUserId && text.includes(`<@${this.botUserId}>`)) {
         const threadKey = `${teamId}:${channelId}:${ts}`;
         this.threadsWithBotMention.add(threadKey);
       }

       // ... rest of handler ...
     }

     private shouldRespond(
       text: string,
       isDM: boolean,
       isThread: boolean,
       threadTs?: string,
       teamId?: string,
       channelId?: string
     ): boolean {
       // ... existing DM and channel logic ...

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
   }
   ```

2. **Implement Thread Workspace Inheritance**

   When a thread conversation is created, inherit workspace isolation from parent channel:

   **File**: `src/adapters/slack.ts`

   ```typescript
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

   private async handleMessage(
     message: any,
     lockManager: ConversationLockManager
   ): Promise<void> {
     // ... existing code ...

     // Ensure thread inherits parent workspace
     if (isThread && !isDM) {
       await this.ensureThreadInheritance(conversationId, teamId, channelId);
     }

     // ... route to orchestrator ...
   }
   ```

3. **Add Thread-Specific CWD Override**

   Allow threads to override CWD while staying within their isolation context.

   Update `/setcwd` command to validate paths are within isolation:

   **File**: `src/handlers/command-handler.ts`

   ```typescript
   case 'setcwd': {
     // ... existing validation ...

     const newCwd = args.join(' ');
     const workspacePath = db.getWorkspacePath(conversation);

     // Validate new CWD is within workspace isolation
     const normalizedNewCwd = join(newCwd);
     const normalizedWorkspace = join(workspacePath);

     if (!normalizedNewCwd.startsWith(normalizedWorkspace)) {
       return {
         success: false,
         message: `Error: Working directory must be within workspace: ${workspacePath}`,
       };
     }

     // ... rest of setcwd logic ...
   }
   ```

**Testing**:
- Test thread creation and parent mention tracking
- Test thread workspace inheritance from parent channel
- Test thread CWD override within isolation
- Test mention requirements in threads

---

### Phase 6: Integration & Initialization

**Goal**: Integrate Slack adapter into main application

#### Tasks:

1. **Update Main Application**

   **File**: `src/index.ts`

   ```typescript
   import { SlackAdapter } from './adapters/slack';

   async function main(): Promise<void> {
     // ... existing validation ...

     // Initialize Slack adapter (conditional)
     let slack: SlackAdapter | null = null;
     if (
       process.env.SLACK_BOT_TOKEN &&
       process.env.SLACK_APP_TOKEN &&
       process.env.SLACK_SIGNING_SECRET
     ) {
       const streamingMode = (process.env.SLACK_STREAMING_MODE || 'stream') as 'stream' | 'batch';
       slack = new SlackAdapter(
         process.env.SLACK_BOT_TOKEN,
         process.env.SLACK_APP_TOKEN,
         process.env.SLACK_SIGNING_SECRET,
         streamingMode
       );

       // Set up event handlers with lock manager
       slack.setupEventHandlers(lockManager);

       await slack.start();
     } else {
       console.log(
         '[Slack] Adapter not initialized (missing SLACK_BOT_TOKEN, SLACK_APP_TOKEN, or SLACK_SIGNING_SECRET)'
       );
     }

     // ... rest of initialization ...

     // Graceful shutdown
     const shutdown = (): void => {
       console.log('[App] Shutting down gracefully...');
       if (telegram) telegram.stop();
       if (slack) slack.stop();
       pool.end().then(() => {
         console.log('[Database] Connection pool closed');
         process.exit(0);
       });
     };

     // ... rest of shutdown logic ...
   }
   ```

2. **Update Package.json**

   **File**: `package.json`

   Update dependencies:
   ```json
   {
     "dependencies": {
       "@slack/bolt": "^4.4.0",
       // ... existing dependencies ...
     }
   }
   ```

   Update keywords:
   ```json
   {
     "keywords": [
       "ai",
       "coding-assistant",
       "telegram",
       "slack",
       "github",
       "claude",
       "codex"
     ]
   }
   ```

3. **Expose Event Handler Setup**

   **File**: `src/adapters/slack.ts`

   Make `setupEventHandlers` public so it can be called from index.ts:

   ```typescript
   export class SlackAdapter implements IPlatformAdapter {
     // ... existing code ...

     public setupEventHandlers(lockManager: ConversationLockManager): void {
       this.setupMessageHandlers(lockManager);
       this.setupEventListeners();
     }

     private setupMessageHandlers(lockManager: ConversationLockManager): void {
       // Message and app_mention handlers
     }

     private setupEventListeners(): void {
       // member_joined_channel and other event handlers
     }
   }
   ```

4. **Update README**

   **File**: `README.md`

   Add Slack section to Platform Adapter Setup:

   ```markdown
   <details>
   <summary><b>💬 Slack</b></summary>

   **Create Slack App:**

   1. Go to https://api.slack.com/apps
   2. Click "Create New App" → "From scratch"
   3. Name your app and select workspace

   **Configure App Settings:**

   1. **OAuth & Permissions**:
      - Add Bot Token Scopes:
        - `app_mentions:read` - Detect @mentions
        - `channels:history` - Read channel messages
        - `channels:read` - View channel info
        - `chat:write` - Send messages
        - `groups:history` - Read private channel messages
        - `groups:read` - View private channels
        - `im:history` - Read DM history
        - `im:write` - Send DMs
        - `users:read` - Read user info
      - Install app to workspace
      - Copy "Bot User OAuth Token" (starts with `xoxb-`)

   2. **Socket Mode**:
      - Enable Socket Mode
      - Generate App-Level Token with `connections:write` scope
      - Copy App-Level Token (starts with `xapp-`)

   3. **Event Subscriptions** (via Socket Mode):
      - Subscribe to bot events:
        - `app_mention` - Bot mentioned in channel
        - `message.channels` - Messages in channels
        - `message.groups` - Messages in private channels
        - `message.im` - Direct messages
        - `member_joined_channel` - Bot added to channel

   4. **App Home**:
      - Enable Messages Tab
      - Allow users to send DMs

   **Set Environment Variables:**

   ```env
   # Required
   SLACK_BOT_TOKEN=xoxb-your-bot-token
   SLACK_APP_TOKEN=xapp-your-app-token
   SLACK_SIGNING_SECRET=your-signing-secret

   # Optional
   SLACK_STREAMING_MODE=stream  # stream (default) | batch
   SLACK_REQUIRE_MENTION_IN_CHANNELS=true  # Require @mention in channels
   SLACK_REQUIRE_MENTION_IN_THREADS=false  # Require @mention in threads
   ```

   **Usage:**

   **In Channels:**
   1. Invite bot to channel: `/invite @your-bot-name`
   2. Bot will ask for workspace name - reply with:
      - A name (e.g., "my-project") for isolated workspace
      - `""` for global workspace
   3. Use commands or ask questions: `@your-bot-name /clone https://github.com/user/repo`

   **In DMs:**
   - Just message the bot directly - no @mention needed
   - First message in DM uses global workspace by default

   **In Threads:**
   - Reply in thread to continue conversation
   - Bot maintains separate context per thread
   - Threads inherit parent channel's workspace

   </details>
   ```

**Testing**:
- Test full application startup with Slack adapter
- Test graceful shutdown
- Verify all environment variables are loaded correctly

---

### Phase 7: Testing & Documentation

**Goal**: Comprehensive testing and documentation

#### Tasks:

1. **Create Unit Tests**

   **File**: `src/adapters/slack.test.ts`

   Test suites:
   - Conversation ID parsing and building
   - Message splitting (3000 char limit)
   - Mention detection and stripping
   - Workspace isolation parsing
   - shouldRespond() logic for different contexts

2. **Create Integration Tests**

   Test scenarios:
   - Bot joins channel → workspace setup flow
   - Channel message → conversation creation → orchestrator routing
   - Thread message → workspace inheritance
   - DM conversation
   - Message sending with proper threading
   - Command execution in different contexts

3. **Update Documentation**

   **File**: `aidocs/slack-adapter-implementation.md`

   Add "Post-Implementation" section with:
   - Architecture overview
   - Conversation context flow diagram
   - Workspace isolation diagram
   - Troubleshooting guide
   - Common issues and solutions

4. **Create Setup Guide**

   **File**: `docs/slack-setup-guide.md`

   Detailed step-by-step guide:
   - Creating Slack app
   - Configuring permissions
   - Enabling Socket Mode
   - Setting up environment variables
   - Testing the integration
   - Common setup errors

**Testing**:
- Run all unit tests
- Run integration tests
- Manual testing in real Slack workspace
- Test all conversation contexts (channel, DM, thread)
- Test workspace isolation
- Test mention requirements

---

### Phase 8: Future Enhancements (Notes Only)

**Goal**: Document potential future improvements

These are noted for future development but not part of the initial implementation:

1. **Webhook Mode Support**
   - Alternative to Socket Mode for high-scale deployments
   - Requires public endpoint like GitHub adapter
   - Would share infrastructure with GitHub webhook handling

2. **Per-Channel Mention Configuration**
   - Allow channels to configure mention requirements individually
   - Could use Slack app configuration or database storage
   - Commands: `/slack-config mention-required true/false`

3. **Thread Conversation Control**
   - `@bot hold` - Pause and collect messages for batch processing
   - `@bot process` - Process collected messages and resume
   - `@bot pause` - Pause without collecting
   - `@bot resume` - Clear collected and resume interactive mode
   - Useful for managing high-volume threads

4. **Slash Command Integration**
   - Native Slack slash commands (e.g., `/remote-agent clone <url>`)
   - Would complement @mention pattern
   - Requires additional Slack app configuration

5. **Interactive Components**
   - Buttons for common actions (approve, retry, cancel)
   - Modals for configuration
   - File picker for workspace selection

6. **Rich Message Formatting**
   - Use Slack Block Kit for better formatting
   - Code syntax highlighting
   - Interactive tool call approvals
   - Progress indicators

7. **Multi-Workspace Support**
   - Support bot installation across multiple Slack workspaces
   - Would require workspace ID tracking in database
   - Separate credentials per workspace

8. **Thread Summary**
   - Command to summarize long thread conversations
   - Helpful for catching up on async discussions

---

## Environment Variables Summary

Add to `.env.example`:

```env
# ================================
# Slack Configuration (Optional)
# ================================

# Required for Slack adapter
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_APP_TOKEN=xapp-your-app-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here

# Streaming mode: stream (default) | batch
SLACK_STREAMING_MODE=stream

# Mention requirements
# Require @mention in channels (default: true)
SLACK_REQUIRE_MENTION_IN_CHANNELS=true

# Require @mention in threads (default: false)
# When false, bot responds to all messages in threads where it was mentioned in parent
SLACK_REQUIRE_MENTION_IN_THREADS=false
```

---

## Key Files to Create/Modify

### New Files:
- `migrations/002_add_workspace_isolation.sql`
- `src/adapters/slack.ts`
- `src/adapters/slack.test.ts`
- `src/handlers/workspace-handler.ts`
- `docs/slack-setup-guide.md`

### Modified Files:
- `src/types/index.ts` - Add `workspace_isolation` to `Conversation`
- `src/db/conversations.ts` - Add `workspace_isolation` support and `getWorkspacePath()`
- `src/handlers/command-handler.ts` - Update commands for workspace isolation
- `src/index.ts` - Initialize Slack adapter
- `package.json` - Add `@slack/bolt` dependency
- `.env.example` - Add Slack environment variables
- `README.md` - Add Slack setup documentation

---

## Implementation Order

For coding agents implementing this plan:

1. **Phase 1** - Foundation (database, types, helpers)
2. **Phase 2** - Core adapter (class structure, message sending)
3. **Phase 3** - Event handling (message routing)
4. **Phase 4** - Workspace isolation (channel setup)
5. **Phase 5** - Thread management (parent tracking, inheritance)
6. **Phase 6** - Integration (wire up in main app)
7. **Phase 7** - Testing (unit, integration, manual)
8. **Phase 8** - Documentation (update README, create guides)

Each phase should be:
1. Implemented fully
2. Tested (unit tests + manual verification)
3. Committed with clear commit message
4. Verified before moving to next phase

---

## Success Criteria

The Slack adapter implementation is complete when:

✅ Bot can be installed in Slack workspace
✅ Bot responds to DMs without requiring @mention
✅ Bot responds to @mentions in channels
✅ Bot responds appropriately in threads based on configuration
✅ Channel workspace isolation setup flow works
✅ Isolated workspaces are created correctly
✅ Threads inherit parent channel workspace
✅ All slash commands work in all contexts
✅ Messages are split correctly (3000 char limit)
✅ Conversation state persists across restarts
✅ Unit tests pass
✅ Integration tests pass
✅ Documentation is complete and accurate

---

## Rollout Strategy

1. Merge feature branch to `jarvis1` after review
2. Test in development environment with private Slack workspace
3. Update production `.env` with Slack credentials
4. Deploy to production
5. Invite bot to test channel
6. Monitor logs for errors
7. Gradually invite to more channels

---

## Notes for Implementers

- **Socket Mode**: No public endpoint needed, easier setup than webhooks
- **Message Limits**: Slack has 3000 char limit (vs Telegram's 4096)
- **Threading**: Slack's threading is more complex than Telegram - careful with `thread_ts`
- **Bot Mentions**: Use `<@{bot_user_id}>` format for detection
- **Workspace Isolation**: Creates `.isolated/` subdirectories - ensure `.gitignore` handles this
- **Error Handling**: Slack API can be slow - add proper timeouts and retries
- **Rate Limits**: Be aware of Slack API rate limits (especially for high-volume channels)

---

## Questions for Code Review

During implementation, pay special attention to:

1. Is workspace isolation correctly enforced?
2. Do threads properly inherit parent context?
3. Are mention requirements working as configured?
4. Is message splitting preserving formatting?
5. Are all edge cases handled (empty messages, bot self-mentions, etc.)?
6. Is error handling robust?
7. Are database migrations backwards compatible?
8. Is the code well-tested?

---

## End of Implementation Plan

This plan provides a comprehensive, phase-by-phase approach to implementing the Slack adapter. Each phase builds on the previous one and can be implemented, tested, and committed independently.
