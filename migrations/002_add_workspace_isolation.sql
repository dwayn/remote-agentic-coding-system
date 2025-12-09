-- Remote Coding Agent - Workspace Isolation Support
-- Version: 2.0
-- Description: Add workspace isolation support for Slack adapter

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
