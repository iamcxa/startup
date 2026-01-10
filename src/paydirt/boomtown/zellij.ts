// src/paydirt/boomtown/zellij.ts
/**
 * Zellij session and layout management for Paydirt Boomtown dashboard.
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

/** Default session name for Boomtown dashboard */
export const BOOMTOWN_SESSION = 'paydirt-boomtown';

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
 * Check if a Zellij session exists.
 *
 * @param sessionName - Name of the session to check
 * @returns true if session exists, false otherwise
 */
export async function sessionExists(sessionName: string): Promise<boolean> {
  try {
    const command = new Deno.Command('zellij', {
      args: ['list-sessions'],
      stdout: 'piped',
      stderr: 'piped',
    });

    const output = await command.output();
    if (!output.success) {
      return false;
    }

    const sessions = new TextDecoder().decode(output.stdout);
    // Session list format: "session-name (created ...)" or just "session-name"
    const lines = sessions.trim().split('\n');
    return lines.some((line) => {
      const name = line.split(/\s+/)[0];
      return name === sessionName;
    });
  } catch {
    // zellij not installed or other error
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
 * Creates a tab that loops attaching to the tmux session `paydirt-${caravanId}`.
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
    const tmuxSession = `paydirt-${caravanId}`;
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
  return '/tmp/paydirt-boomtown.kdl';
}
