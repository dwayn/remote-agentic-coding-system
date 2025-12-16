/**
 * Workspace isolation handler
 * Manages workspace directories for channel-specific isolation
 */
import { mkdir } from 'fs/promises';
import { join } from 'path';

/**
 * Set up workspace isolation directory
 * @param isolationName - Name of the isolation context (null for global workspace)
 * @param globalWorkspace - Global workspace root path
 * @returns The effective workspace path to use
 */
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

/**
 * Parse user input for workspace name
 * @param input - User input string
 * @returns Isolation name (null for global workspace)
 * @throws Error if input is invalid
 */
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
