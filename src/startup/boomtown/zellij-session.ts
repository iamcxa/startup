// src/startup/boomtown/zellij-session.ts
/**
 * Pure Zellij session management for Startup.
 *
 * This module provides session management without tmux dependency.
 * Claude runs directly in Zellij panes for native scrolling support.
 */

// ============================================================================
// Types
// ============================================================================

/** Session state from zellij list-sessions */
export type SessionState = 'alive' | 'dead' | 'none';

/** Information about a Zellij session (only existing sessions, never 'none') */
export interface SessionInfo {
  name: string;
  state: 'alive' | 'dead';
  created?: string;
}

/** Options for adding a pane to a session */
export interface AddPaneOptions {
  name?: string;
  direction?: 'down' | 'right';
  cwd?: string;
  closeOnExit?: boolean;
}

/** Options for creating a background session */
export interface CreateSessionOptions {
  layoutPath?: string;
  cwd?: string;
  forceRunCommands?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Prefix for all startup sessions */
export const SESSION_PREFIX = 'startup-';

/** Company HQ session name */
export const COMPANY_SESSION = 'startup-company';

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Strip ANSI color codes from a string.
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Run a Zellij command and return the result.
 */
async function runZellij(
  args: string[],
  options?: { session?: string; inherit?: boolean },
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  const env: Record<string, string> = { ...Deno.env.toObject() };
  if (options?.session) {
    env['ZELLIJ_SESSION_NAME'] = options.session;
  }

  const cmd = new Deno.Command('zellij', {
    args,
    env,
    stdin: options?.inherit ? 'inherit' : 'null',
    stdout: options?.inherit ? 'inherit' : 'piped',
    stderr: options?.inherit ? 'inherit' : 'piped',
  });

  if (options?.inherit) {
    const status = await cmd.spawn().status;
    return { success: status.success, stdout: '', stderr: '' };
  }

  const output = await cmd.output();
  return {
    success: output.success,
    stdout: new TextDecoder().decode(output.stdout),
    stderr: new TextDecoder().decode(output.stderr),
  };
}

// ============================================================================
// Session State
// ============================================================================

/**
 * Get the state of a Zellij session.
 *
 * @param sessionName - Name of the session to check
 * @returns 'alive', 'dead', or 'none'
 */
export async function getSessionState(sessionName: string): Promise<SessionState> {
  const result = await runZellij(['list-sessions']);
  if (!result.success) {
    return 'none';
  }

  const lines = result.stdout.trim().split('\n');
  for (const line of lines) {
    const cleanLine = stripAnsi(line);
    const name = cleanLine.split(/\s+/)[0];
    if (name === sessionName) {
      return cleanLine.includes('EXITED') ? 'dead' : 'alive';
    }
  }
  return 'none';
}

/**
 * Check if a Zellij session exists (alive or dead).
 */
export async function sessionExists(sessionName: string): Promise<boolean> {
  const state = await getSessionState(sessionName);
  return state !== 'none';
}

/**
 * Check if a Zellij session is alive and running.
 */
export async function sessionIsAlive(sessionName: string): Promise<boolean> {
  const state = await getSessionState(sessionName);
  return state === 'alive';
}

// ============================================================================
// Session Lifecycle
// ============================================================================

/**
 * Create a new Zellij session in the background (detached).
 *
 * Uses `zellij attach --create-background` to create a session
 * without attaching to it.
 *
 * @param sessionName - Name for the new session
 * @param options - Creation options (layout, cwd, etc.)
 * @returns true if created successfully
 */
export async function createBackgroundSession(
  sessionName: string,
  options?: CreateSessionOptions,
): Promise<boolean> {
  const args = ['attach', '--create-background', sessionName];

  // Add options subcommand if we have layout or other options
  if (options?.layoutPath || options?.cwd || options?.forceRunCommands) {
    args.push('options');
    if (options.layoutPath) {
      args.push('--default-layout', options.layoutPath);
    }
    if (options.cwd) {
      args.push('--default-cwd', options.cwd);
    }
  }

  // Add force-run-commands flag at attach level (not options level)
  if (options?.forceRunCommands) {
    // Insert before 'options' if present
    const optionsIndex = args.indexOf('options');
    if (optionsIndex > 0) {
      args.splice(optionsIndex, 0, '--force-run-commands');
    }
  }

  const result = await runZellij(args);
  return result.success;
}

/**
 * Create a new Zellij session and attach to it.
 *
 * @param sessionName - Name for the new session
 * @param layoutPath - Optional path to KDL layout file
 * @returns true if created and attached successfully
 */
export async function createSession(
  sessionName: string,
  layoutPath?: string,
): Promise<boolean> {
  const args = ['-s', sessionName];
  if (layoutPath) {
    args.push('-n', layoutPath);
  }

  const result = await runZellij(args, { inherit: true });
  return result.success;
}

/**
 * Attach to an existing Zellij session.
 *
 * @param sessionName - Name of the session to attach to
 * @param options - Attachment options
 */
export async function attachSession(
  sessionName: string,
  options?: { forceRunCommands?: boolean },
): Promise<void> {
  const args = ['attach', sessionName];
  if (options?.forceRunCommands) {
    args.push('--force-run-commands');
  }

  const result = await runZellij(args, { inherit: true });
  if (!result.success) {
    throw new Error(`Failed to attach to Zellij session: ${sessionName}`);
  }
}

/**
 * Kill a Zellij session.
 *
 * @param sessionName - Name of the session to kill
 * @returns true if killed successfully
 */
export async function killSession(sessionName: string): Promise<boolean> {
  const result = await runZellij(['kill-session', sessionName]);
  return result.success;
}

/**
 * Delete a Zellij session (for dead sessions).
 *
 * @param sessionName - Name of the session to delete
 * @returns true if deleted successfully
 */
export async function deleteSession(sessionName: string): Promise<boolean> {
  const result = await runZellij(['delete-session', sessionName]);
  return result.success;
}

// ============================================================================
// Session Listing
// ============================================================================

/**
 * List all Zellij sessions.
 *
 * @returns Array of session info
 */
export async function listSessions(): Promise<SessionInfo[]> {
  const result = await runZellij(['list-sessions']);
  if (!result.success) {
    return [];
  }

  const sessions: SessionInfo[] = [];
  const lines = result.stdout.trim().split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;

    const cleanLine = stripAnsi(line);
    const name = cleanLine.split(/\s+/)[0];
    if (!name) continue;

    const state: SessionState = cleanLine.includes('EXITED') ? 'dead' : 'alive';

    // Extract created time if present
    const createdMatch = cleanLine.match(/\[Created ([^\]]+)\]/);
    const created = createdMatch ? createdMatch[1] : undefined;

    sessions.push({ name, state, created });
  }

  return sessions;
}

/**
 * List all startup-related Zellij sessions.
 *
 * @returns Array of session info for startup-* sessions
 */
export async function listStartupSessions(): Promise<SessionInfo[]> {
  const sessions = await listSessions();
  return sessions.filter((s) => s.name.startsWith(SESSION_PREFIX));
}

// ============================================================================
// Remote Session Control
// ============================================================================

/**
 * Execute a Zellij action on a remote session.
 *
 * @param session - Target session name
 * @param action - Action to execute
 * @param args - Action arguments
 * @returns true if successful
 */
export async function executeAction(
  session: string,
  action: string,
  args: string[] = [],
): Promise<boolean> {
  const result = await runZellij(['action', action, ...args], { session });
  return result.success;
}

/**
 * Add a new tab to a remote session.
 *
 * @param session - Target session name
 * @param tabName - Name for the new tab
 * @returns true if successful
 */
export async function addTabToSession(
  session: string,
  tabName: string,
): Promise<boolean> {
  return executeAction(session, 'new-tab', ['--name', tabName]);
}

/**
 * Add a new pane to a remote session and run a command in it.
 *
 * @param session - Target session name
 * @param command - Command to run in the pane
 * @param options - Pane options (direction, name, etc.)
 * @returns true if successful
 */
export async function addPaneToSession(
  session: string,
  command: string,
  options?: AddPaneOptions,
): Promise<boolean> {
  const args: string[] = [];

  if (options?.direction) {
    args.push('--direction', options.direction);
  }
  if (options?.name) {
    args.push('--name', options.name);
  }
  if (options?.cwd) {
    args.push('--cwd', options.cwd);
  }
  if (options?.closeOnExit) {
    args.push('--close-on-exit');
  }

  // Add command separator and command
  args.push('--', command);

  return executeAction(session, 'new-pane', args);
}

/**
 * Write characters to the focused pane of a remote session.
 *
 * @param session - Target session name
 * @param chars - Characters to write
 * @returns true if successful
 */
export async function writeCharsToSession(
  session: string,
  chars: string,
): Promise<boolean> {
  return executeAction(session, 'write-chars', [chars]);
}

/**
 * Send Enter key to the focused pane of a remote session.
 *
 * @param session - Target session name
 * @returns true if successful
 */
export async function sendEnterToSession(session: string): Promise<boolean> {
  return executeAction(session, 'write', ['13']);
}

/**
 * Execute a command in a remote session by writing it and pressing Enter.
 *
 * @param session - Target session name
 * @param command - Command to execute
 * @returns true if successful
 */
export async function executeCommandInSession(
  session: string,
  command: string,
): Promise<boolean> {
  const writeSuccess = await writeCharsToSession(session, command);
  if (!writeSuccess) return false;

  return sendEnterToSession(session);
}

/**
 * Query tab names from a remote session.
 *
 * @param session - Target session name
 * @returns Array of tab names
 */
export async function getTabNames(session: string): Promise<string[]> {
  const result = await runZellij(['action', 'query-tab-names'], { session });
  if (!result.success) {
    return [];
  }

  return result.stdout
    .trim()
    .split('\n')
    .filter((line) => line.trim());
}

/**
 * Go to a specific tab by name in a remote session.
 *
 * @param session - Target session name
 * @param tabName - Name of the tab to go to
 * @returns true if successful
 */
export async function goToTab(session: string, tabName: string): Promise<boolean> {
  return executeAction(session, 'go-to-tab-name', [tabName]);
}

/**
 * Close the current tab in a remote session.
 *
 * @param session - Target session name
 * @returns true if successful
 */
export async function closeTab(session: string): Promise<boolean> {
  return executeAction(session, 'close-tab');
}

// ============================================================================
// Layout Helpers
// ============================================================================

/**
 * Escape a string for use in KDL format.
 */
export function escapeKdlString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Generate a temporary layout file path.
 *
 * @param suffix - Optional suffix for the file name
 * @returns Path in /tmp for the layout file
 */
export function getTempLayoutPath(suffix?: string): string {
  const name = suffix ? `startup-${suffix}.kdl` : 'startup-layout.kdl';
  return `/tmp/${name}`;
}

/**
 * Write a layout file to disk.
 *
 * @param path - Path to write to
 * @param content - KDL layout content
 */
export async function writeLayoutFile(path: string, content: string): Promise<void> {
  await Deno.writeTextFile(path, content);
}

/**
 * Generate a simple layout with a single tab and command.
 *
 * @param tabName - Name for the tab
 * @param command - Command to run in the pane
 * @param paneName - Optional name for the pane
 * @returns KDL layout string
 */
export function generateSimpleLayout(
  tabName: string,
  command: string,
  paneName?: string,
): string {
  const paneNameAttr = paneName ? ` name="${escapeKdlString(paneName)}"` : '';

  return `layout {
    default_tab_template {
        pane size=1 borderless=true {
            plugin location="zellij:tab-bar"
        }
        children
        pane size=2 borderless=true {
            plugin location="zellij:status-bar"
        }
    }

    tab name="${escapeKdlString(tabName)}" focus=true {
        pane${paneNameAttr} {
            command "bash"
            args "-c" "${escapeKdlString(command)}"
        }
    }
}
`;
}

// ============================================================================
// High-Level Session Management
// ============================================================================

/**
 * Ensure a session exists, creating it if necessary.
 *
 * @param sessionName - Name of the session
 * @param layoutPath - Path to layout file if creating
 * @param cwd - Working directory if creating
 * @returns 'created' | 'existed' | 'resurrected' | 'failed'
 */
export async function ensureSession(
  sessionName: string,
  layoutPath?: string,
  cwd?: string,
): Promise<'created' | 'existed' | 'resurrected' | 'failed'> {
  const state = await getSessionState(sessionName);

  switch (state) {
    case 'alive':
      return 'existed';

    case 'dead':
      // Delete the dead session first
      await deleteSession(sessionName);
      // Fall through to create new session
      // falls through

    case 'none': {
      const success = await createBackgroundSession(sessionName, {
        layoutPath,
        cwd,
      });
      return success ? (state === 'dead' ? 'resurrected' : 'created') : 'failed';
    }
  }
}

/**
 * Create a team session with Claude running directly.
 *
 * @param teamId - Team ID (used for session name: startup-{teamId})
 * @param claudeCommand - Full Claude command to run
 * @param tabName - Name for the initial tab
 * @returns true if created successfully
 */
export async function createTeamSession(
  teamId: string,
  claudeCommand: string,
  tabName: string = 'Team',
): Promise<boolean> {
  const sessionName = `${SESSION_PREFIX}${teamId}`;

  // Check if session already exists
  const state = await getSessionState(sessionName);
  if (state === 'alive') {
    return true; // Already running
  }

  // Delete dead session if exists
  if (state === 'dead') {
    await deleteSession(sessionName);
  }

  // Generate layout with Claude command
  const layout = generateSimpleLayout(tabName, claudeCommand, 'lead');
  const layoutPath = getTempLayoutPath(teamId);
  await writeLayoutFile(layoutPath, layout);

  // Create background session
  return createBackgroundSession(sessionName, { layoutPath });
}

/**
 * Add an agent (role) to an existing team session.
 *
 * @param teamId - Team ID
 * @param role - Role name (used as pane name)
 * @param claudeCommand - Full Claude command for this role
 * @returns true if added successfully
 */
export async function addAgentToTeam(
  teamId: string,
  role: string,
  claudeCommand: string,
): Promise<boolean> {
  const sessionName = `${SESSION_PREFIX}${teamId}`;

  // Verify session exists
  if (!(await sessionIsAlive(sessionName))) {
    return false;
  }

  // Add new pane with Claude command
  return addPaneToSession(sessionName, claudeCommand, {
    name: role,
    direction: 'down',
  });
}
