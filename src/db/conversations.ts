/**
 * Database operations for conversations
 */
import { join } from 'path';
import { pool } from './connection';
import { Conversation } from '../types';

export async function getOrCreateConversation(
  platformType: string,
  platformId: string,
  codebaseId?: string
): Promise<Conversation> {
  const existing = await pool.query<Conversation>(
    'SELECT * FROM remote_agent_conversations WHERE platform_type = $1 AND platform_conversation_id = $2',
    [platformType, platformId]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  // Determine assistant type from codebase or environment
  let assistantType = process.env.DEFAULT_AI_ASSISTANT || 'claude';
  if (codebaseId) {
    const codebase = await pool.query<{ ai_assistant_type: string }>(
      'SELECT ai_assistant_type FROM remote_agent_codebases WHERE id = $1',
      [codebaseId]
    );
    if (codebase.rows[0]) {
      assistantType = codebase.rows[0].ai_assistant_type;
    }
  }

  const created = await pool.query<Conversation>(
    'INSERT INTO remote_agent_conversations (platform_type, platform_conversation_id, ai_assistant_type) VALUES ($1, $2, $3) RETURNING *',
    [platformType, platformId, assistantType]
  );

  return created.rows[0];
}

export async function updateConversation(
  id: string,
  updates: Partial<Pick<Conversation, 'codebase_id' | 'cwd' | 'workspace_isolation'>>
): Promise<void> {
  const fields: string[] = [];
  const values: (string | null)[] = [];
  let i = 1;

  if (updates.codebase_id !== undefined) {
    fields.push(`codebase_id = $${i++}`);
    values.push(updates.codebase_id);
  }
  if (updates.cwd !== undefined) {
    fields.push(`cwd = $${i++}`);
    values.push(updates.cwd);
  }
  if (updates.workspace_isolation !== undefined) {
    fields.push(`workspace_isolation = $${i++}`);
    values.push(updates.workspace_isolation);
  }

  if (fields.length === 0) {
    return; // No updates
  }

  fields.push('updated_at = NOW()');
  values.push(id);

  await pool.query(
    `UPDATE remote_agent_conversations SET ${fields.join(', ')} WHERE id = $${i}`,
    values
  );
}

/**
 * Get the effective workspace path for a conversation
 * Respects workspace isolation if set
 */
export function getWorkspacePath(
  conversation: Conversation,
  globalWorkspace: string = process.env.WORKSPACE_PATH || './workspace'
): string {
  if (conversation.workspace_isolation) {
    return join(globalWorkspace, '.isolated', conversation.workspace_isolation);
  }
  return globalWorkspace;
}
