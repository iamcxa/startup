// src/startup/boomtown/zellij.ts
/**
 * Zellij session and layout management for Startup Boomtown dashboard.
 * Enables dynamic caravan tab addition without restart.
 *
 * Key advantages over mprocs:
 * - Dynamic tab creation/removal at runtime
 * - Better tmux session integration
 * - Native plugin system for status bar
 *
 * Reference: gastown_b/src/dashboard/mprocs.ts (original implementation)
 */

// ============================================================================
// Types and Constants
// ============================================================================

/** Session name for the unified Startup dashboard */
export const STARTUP_SESSION = 'startup';

/** Legacy alias for backward compatibility */
export const BOOMTOWN_SESSION = STARTUP_SESSION;

/** Tmux session for CTO (company-level) */
export const CTO_TMUX_SESSION = 'startup-company';

/** Tab name for CTO */
export const CTO_TAB_NAME = 'CTO';

/** Configuration for a single pane in Zellij */
export interface ZellijPane {
  name: string;
  command: string;
  cwd?: string;
}

/** Configuration for a tab containing panes */
export interface ZellijTab {
  name: string;
  panes: ZellijPane[];
}

/** Full layout configuration for Zellij session */
export interface ZellijLayout {
  tabs: ZellijTab[];
}

// ============================================================================
// Layout Generator
// ============================================================================

/**
 * Generate KDL layout for Boomtown dashboard.
 *
 * Creates a layout with:
 * - Tab "Control" with Control Room (30% left) and Camp Boss (70% right)
 * - default_tab_template with tab-bar and status-bar plugins
 *
 * @param controlRoomScript - Path to Control Room status script
 * @param campBossScript - Path to Camp Boss interactive script
 * @returns KDL layout string for Zellij
 */
export function generateBoomtownLayout(
  controlRoomScript: string,
  campBossScript: string,
): string {
  // KDL layout format for Zellij
  // Uses split layout with Control Room on left (30%) and Camp Boss on right (70%)
  return `layout {
    // Default template for new tabs (used by dynamic caravan tabs)
    default_tab_template {
        pane size=1 borderless=true {
            plugin location="zellij:tab-bar"
        }
        children
        pane size=2 borderless=true {
            plugin location="zellij:status-bar"
        }
    }

    // Control tab - main dashboard view
    tab name="Control" focus=true {
        pane size=1 borderless=true {
            plugin location="zellij:tab-bar"
        }
        pane split_direction="vertical" {
            pane size="30%" name="Assay Office" {
                command "bash"
                args "-c" "${escapeKdlString(controlRoomScript)}"
            }
            pane size="70%" name="Camp Boss" {
                command "bash"
                args "-c" "${escapeKdlString(campBossScript)}"
            }
        }
        pane size=2 borderless=true {
            plugin location="zellij:status-bar"
        }
    }
}
`;
}

/**
 * Escape a string for use in KDL format.
 * Handles quotes and special characters.
 */
function escapeKdlString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Session state from zellij list-sessions
 */
export type SessionState = 'alive' | 'dead' | 'none';

/**
 * Check the state of a Zellij session.
 *
 * @param sessionName - Name of the session to check
 * @returns 'alive' if session is running, 'dead' if exited, 'none' if doesn't exist
 */
export async function getSessionState(sessionName: string): Promise<SessionState> {
  try {
    const command = new Deno.Command('zellij', {
      args: ['list-sessions'],
      stdout: 'piped',
      stderr: 'piped',
    });

    const output = await command.output();
    if (!output.success) {
      return 'none';
    }

    const sessions = new TextDecoder().decode(output.stdout);
    const lines = sessions.trim().split('\n');

    for (const line of lines) {
      // Session list format: "session-name" or "session-name (EXITED ...)"
      const name = line.split(/\s+/)[0];
      if (name === sessionName) {
        // Check if session is dead (EXITED)
        if (line.includes('EXITED')) {
          return 'dead';
        }
        return 'alive';
      }
    }
    return 'none';
  } catch {
    // zellij not installed or other error
    return 'none';
  }
}

/**
 * Check if a Zellij session exists (alive or dead).
 *
 * @param sessionName - Name of the session to check
 * @returns true if session exists, false otherwise
 */
export async function sessionExists(sessionName: string): Promise<boolean> {
  const state = await getSessionState(sessionName);
  return state !== 'none';
}

/**
 * Delete a Zellij session.
 *
 * @param sessionName - Name of the session to delete
 * @returns true if deleted successfully
 */
export async function deleteSession(sessionName: string): Promise<boolean> {
  try {
    const command = new Deno.Command('zellij', {
      args: ['delete-session', sessionName],
      stdout: 'piped',
      stderr: 'piped',
    });

    const output = await command.output();
    return output.success;
  } catch {
    return false;
  }
}

/**
 * Attach to an existing Zellij session.
 *
 * @param sessionName - Name of the session to attach to
 */
export async function attachSession(sessionName: string): Promise<void> {
  const command = new Deno.Command('zellij', {
    args: ['attach', sessionName],
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const status = await command.spawn().status;
  if (!status.success) {
    throw new Error(`Failed to attach to Zellij session: ${sessionName}`);
  }
}

/**
 * Create a new Zellij session with the specified layout.
 *
 * @param sessionName - Name for the new session
 * @param layoutPath - Path to the KDL layout file
 * @returns true if session was created successfully, false otherwise
 */
export async function createSession(
  sessionName: string,
  layoutPath: string,
): Promise<boolean> {
  try {
    // Use -s for session name and -n for new session with layout
    // This ensures we always create a new session rather than
    // trying to add tabs to an existing one
    const command = new Deno.Command('zellij', {
      args: [
        '-s',
        sessionName,
        '-n',
        layoutPath,
      ],
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    });

    const status = await command.spawn().status;
    return status.success;
  } catch {
    return false;
  }
}

// ============================================================================
// Dynamic Caravan Tab Management
// ============================================================================

/**
 * Add a new tab for a Caravan, attaching to its tmux session.
 *
 * Creates a tab that loops attaching to the tmux session `startup-${caravanId}`.
 * The loop ensures reconnection if the tmux session is recreated.
 *
 * @param caravanId - ID of the caravan (used for tmux session name)
 * @param caravanName - Display name for the tab
 * @returns true if tab was added successfully, false otherwise
 */
export async function addCaravanTab(
  caravanId: string,
  caravanName: string,
): Promise<boolean> {
  try {
    const tmuxSession = `startup-${caravanId}`;
    const tabName = caravanName || `Caravan-${caravanId.slice(0, 8)}`;

    // Create a loop script that keeps trying to attach to the tmux session
    // This handles cases where the tmux session doesn't exist yet or is recreated
    const attachScript =
      `while true; do tmux attach-session -t ${tmuxSession} 2>/dev/null || (echo "Waiting for caravan session ${tmuxSession}..." && sleep 2); done`;

    // Use Zellij action to create new tab
    // First create the tab, then rename it
    const createTabCmd = new Deno.Command('zellij', {
      args: [
        'action',
        'new-tab',
        '--layout-dir',
        '/dev/null', // Use default layout
        '--name',
        tabName,
      ],
      stdout: 'piped',
      stderr: 'piped',
    });

    const createResult = await createTabCmd.output();
    if (!createResult.success) {
      // Try alternative approach: create tab and run command
      const altCmd = new Deno.Command('zellij', {
        args: ['action', 'new-tab', '--name', tabName],
        stdout: 'piped',
        stderr: 'piped',
      });

      const altResult = await altCmd.output();
      if (!altResult.success) {
        return false;
      }
    }

    // Write the command to the new pane
    const writeCmd = new Deno.Command('zellij', {
      args: ['action', 'write-chars', attachScript],
      stdout: 'piped',
      stderr: 'piped',
    });

    await writeCmd.output();

    // Execute the command by pressing Enter
    const enterCmd = new Deno.Command('zellij', {
      args: ['action', 'write', '13'], // 13 = Enter key
      stdout: 'piped',
      stderr: 'piped',
    });

    const enterResult = await enterCmd.output();
    return enterResult.success;
  } catch {
    return false;
  }
}

/**
 * Remove a Caravan tab by name.
 *
 * @param tabName - Name of the tab to remove
 * @returns true if tab was removed successfully, false otherwise
 */
export async function removeCaravanTab(tabName: string): Promise<boolean> {
  try {
    // Zellij doesn't have a direct "close tab by name" action
    // We need to go to the tab first, then close it

    // First, try to go to the tab by name
    const gotoCmd = new Deno.Command('zellij', {
      args: ['action', 'go-to-tab-name', tabName],
      stdout: 'piped',
      stderr: 'piped',
    });

    const gotoResult = await gotoCmd.output();
    if (!gotoResult.success) {
      // Tab doesn't exist or couldn't be found
      return false;
    }

    // Now close the current tab
    const closeCmd = new Deno.Command('zellij', {
      args: ['action', 'close-tab'],
      stdout: 'piped',
      stderr: 'piped',
    });

    const closeResult = await closeCmd.output();
    return closeResult.success;
  } catch {
    return false;
  }
}

// ============================================================================
// Dynamic Team Tab Management
// ============================================================================

/**
 * Add a new Team tab to the Startup dashboard.
 * Creates a tab with initial pane attaching to the team's tmux session.
 *
 * @param teamId - Team ID (e.g., "st-abc123")
 * @param teamName - Display name for the tab
 * @param initialRole - First role in the team (default: "lead")
 * @returns true if tab was added successfully
 */
export async function addTeamTab(
  teamId: string,
  teamName: string,
  initialRole: string = 'lead',
): Promise<boolean> {
  try {
    const tmuxSession = `startup-${teamId}`;
    const tabName = teamName || `team-${teamId.slice(0, 8)}`;

    // Create reconnecting attach script
    const attachScript =
      `while true; do tmux attach-session -t ${tmuxSession}:${initialRole} 2>/dev/null || (echo "Waiting for ${initialRole}..." && sleep 2); done`;

    // Create new tab
    const createCmd = new Deno.Command('zellij', {
      args: ['action', 'new-tab', '--name', tabName],
      stdout: 'piped',
      stderr: 'piped',
    });

    const createResult = await createCmd.output();
    if (!createResult.success) {
      return false;
    }

    // Write the attach command
    const writeCmd = new Deno.Command('zellij', {
      args: ['action', 'write-chars', attachScript],
      stdout: 'piped',
      stderr: 'piped',
    });
    await writeCmd.output();

    // Press Enter to execute
    const enterCmd = new Deno.Command('zellij', {
      args: ['action', 'write', '13'],
      stdout: 'piped',
      stderr: 'piped',
    });
    await enterCmd.output();

    return true;
  } catch {
    return false;
  }
}

/**
 * Add a new role pane to an existing team tab.
 * Splits the current pane vertically (stacked layout).
 *
 * @param teamId - Team ID
 * @param role - Role name (e.g., "engineer", "product")
 * @returns true if pane was added successfully
 */
export async function addRolePaneToTeam(
  teamId: string,
  role: string,
): Promise<boolean> {
  try {
    const tmuxSession = `startup-${teamId}`;
    const tabName = `team-${teamId.slice(0, 8)}`;

    // First, switch to the team tab
    const gotoCmd = new Deno.Command('zellij', {
      args: ['action', 'go-to-tab-name', tabName],
      stdout: 'piped',
      stderr: 'piped',
    });

    const gotoResult = await gotoCmd.output();
    if (!gotoResult.success) {
      // Tab doesn't exist, try creating it first
      return false;
    }

    // Create new pane (splits down by default - vertical stack)
    const newPaneCmd = new Deno.Command('zellij', {
      args: ['action', 'new-pane', '--direction', 'down'],
      stdout: 'piped',
      stderr: 'piped',
    });

    const paneResult = await newPaneCmd.output();
    if (!paneResult.success) {
      return false;
    }

    // Write attach command for the new role
    const attachScript =
      `while true; do tmux attach-session -t ${tmuxSession}:${role} 2>/dev/null || (echo "Waiting for ${role}..." && sleep 2); done`;

    const writeCmd = new Deno.Command('zellij', {
      args: ['action', 'write-chars', attachScript],
      stdout: 'piped',
      stderr: 'piped',
    });
    await writeCmd.output();

    // Press Enter
    const enterCmd = new Deno.Command('zellij', {
      args: ['action', 'write', '13'],
      stdout: 'piped',
      stderr: 'piped',
    });
    await enterCmd.output();

    return true;
  } catch {
    return false;
  }
}

/**
 * Focus on a specific role pane within a team tab.
 * Used when HUMAN_REQUIRED is detected.
 *
 * @param teamId - Team ID
 * @param _role - Role name (currently unused, focuses last pane)
 * @returns true if focus was switched successfully
 */
export async function focusTeamRole(
  teamId: string,
  _role: string,
): Promise<boolean> {
  try {
    const tabName = `team-${teamId.slice(0, 8)}`;

    // Switch to the team tab
    const gotoCmd = new Deno.Command('zellij', {
      args: ['action', 'go-to-tab-name', tabName],
      stdout: 'piped',
      stderr: 'piped',
    });

    const result = await gotoCmd.output();
    if (!result.success) {
      return false;
    }

    // Focus the last pane (most recently added, likely the one needing attention)
    // Note: Zellij doesn't have "focus pane by name", so we focus the bottom pane
    const focusCmd = new Deno.Command('zellij', {
      args: ['action', 'focus-next-pane'],
      stdout: 'piped',
      stderr: 'piped',
    });
    await focusCmd.output();

    return true;
  } catch {
    return false;
  }
}

/**
 * List all team tabs in the current session.
 * @returns Array of tab names starting with "team-"
 */
export async function listTeamTabs(): Promise<string[]> {
  // Note: Zellij doesn't have a direct "list tabs" action
  // This is a placeholder - in practice, we track tabs ourselves
  return [];
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Write a layout file to the specified path.
 *
 * @param layoutPath - Path where layout file should be written
 * @param layoutContent - KDL layout content
 */
export async function writeLayoutFile(
  layoutPath: string,
  layoutContent: string,
): Promise<void> {
  await Deno.writeTextFile(layoutPath, layoutContent);
}

/**
 * Generate a temporary layout file path.
 *
 * @returns Path in /tmp for the layout file
 */
export function getTempLayoutPath(): string {
  return '/tmp/startup-boomtown.kdl';
}
