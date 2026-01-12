// src/startup/boomtown/camp-boss-pane.ts

/**
 * Camp Boss pane script generator for Startup Boomtown dashboard.
 * Creates a bash script that manages the Camp Boss (human interface) in a persistent tmux session.
 *
 * Design: GOLD RUSH / WESTERN FRONTIER AESTHETIC
 * - Mining camp banner with gold nuggets
 * - Lantern-style status indicators
 * - Dark brown/gold color scheme
 *
 * Key design: Camp Boss runs in tmux session `startup-camp-boss` so that
 * mprocs can restart without losing the Claude Code conversation.
 *
 * Reference: gastown_b/src/dashboard/commander-pane.ts (Commander with purple theme)
 */

/**
 * Generate the Camp Boss pane script content.
 *
 * Behavior:
 * - Auto-attaches to `startup-camp-boss` tmux session if exists
 * - Shows detail panel if session doesn't exist
 * - [s] creates tmux session and launches Claude Code
 * - mprocs restart will just re-attach (conversation preserved)
 *
 * @param startupPath - Full path to startup binary
 * @param agentFilePath - Full path to camp-boss agent file (.claude/agents/camp-boss.md)
 * @param projectRoot - Project root directory (for loading .claude/commands/)
 * @returns Bash script content
 */
export function generateCampBossScriptContent(
  startupPath: string,
  agentFilePath?: string,
  projectRoot?: string,
): string {
  const agentFileVar = agentFilePath ? `AGENT_FILE="${agentFilePath}"` : `AGENT_FILE=""`;
  const projectRootVar = projectRoot ? `PROJECT_ROOT="${projectRoot}"` : `PROJECT_ROOT="$(pwd)"`;

  return `#!/bin/bash
# ========================================================================
# STARTUP BOOMTOWN - Camp Boss Pane (tmux-backed for persistence)
# Gold Rush / Western Frontier Aesthetic
# Runs Camp Boss in tmux session so mprocs restart doesn't lose conversation
# ========================================================================

STARTUP_BIN="${startupPath}"
${agentFileVar}
${projectRootVar}
SESSION_NAME="startup-camp-boss"

# Colors - Gold Rush Theme
BG="\\033[48;5;94m"        # Dark brown background
FG="\\033[38;5;220m"       # Gold foreground
AMBER="\\033[38;5;214m"    # Amber accent
CYAN="\\033[38;5;180m"     # Tan/beige for highlights
DIM="\\033[38;5;137m"      # Dim tan
RESET="\\033[0m"

SPIN=('◐' '◓' '◑' '◒')
FRAME=0

show_panel() {
  local spin=\${SPIN[\$FRAME]}
  FRAME=$(( (FRAME + 1) % 4 ))
  echo -ne "\${BG}"
  clear
  echo -e "\${FG}"
  echo "  ██████╗  █████╗ ██╗   ██╗██████╗ ██╗██████╗ ████████╗"
  echo "  ██╔══██╗██╔══██╗╚██╗ ██╔╝██╔══██╗██║██╔══██╗╚══██╔══╝"
  echo "  ██████╔╝███████║ ╚████╔╝ ██║  ██║██║██████╔╝   ██║   "
  echo "  ██╔═══╝ ██╔══██║  ╚██╔╝  ██║  ██║██║██╔══██╗   ██║   "
  echo "  ██║     ██║  ██║   ██║   ██████╔╝██║██║  ██║   ██║   "
  echo "  ╚═╝     ╚═╝  ╚═╝   ╚═╝   ╚═════╝ ╚═╝╚═╝  ╚═╝   ╚═╝   "
  echo ""
  echo -e "\${AMBER} ⛏────────────────────────────────────────────────────────────────────⛏"
  echo -e " │  B O O M T O W N   -   M U L T I - A G E N T   O R C H E S T R A T O R │"
  echo -e " ⛏────────────────────────────────────────────────────────────────────⛏"
  echo -e "\${FG}"
  echo " ╔══════════════════════════════════════════════════════════════════════════════╗"
  echo -e " ║  \${AMBER}\$spin CAMP BOSS - Strategic Control Interface\${FG}                             ║"
  echo " ╠══════════════════════════════════════════════════════════════════════════════╣"
  echo " ║                                                                              ║"
  echo " ║  The Camp Boss is your strategic interface to Boomtown.                      ║"
  echo " ║                                                                              ║"
  echo " ║  Capabilities:                                                               ║"
  echo " ║    • Start new Caravans                                                      ║"
  echo " ║    • Monitor all active Caravans                                             ║"
  echo " ║    • Check Linear issues                                                     ║"
  echo " ║    • Review decisions                                                        ║"
  echo " ║    • Set goals and priorities                                                ║"
  echo " ║                                                                              ║"
  echo " ╠══════════════════════════════════════════════════════════════════════════════╣"
  if tmux has-session -t "\$SESSION_NAME" 2>/dev/null; then
    echo -e " ║  \${CYAN}✓ Camp Boss session ACTIVE\${FG}                                              ║"
    echo -e " ║  \${AMBER}[a]\${FG} ATTACH to running session                                            ║"
  else
    echo -e " ║  \${DIM}○ Camp Boss session not running\${FG}                                         ║"
    echo -e " ║  \${AMBER}[s]\${FG} START Camp Boss (launch Claude Code)                                  ║"
  fi
  echo -e " ║  \${DIM}[C-a] Focus process list  [q] Exit\${FG}                                        ║"
  echo " ╠══════════════════════════════════════════════════════════════════════════════╣"
  printf " ║  Agent: \${DIM}%-62s\${FG}  ║\\n" "\$AGENT_FILE"
  printf " ║  Project: \${DIM}%-60s\${FG}  ║\\n" "\$PROJECT_ROOT"
  echo " ╚══════════════════════════════════════════════════════════════════════════════╝"
  echo -e "\${RESET}"
}

start_camp_boss() {
  echo -e "\\n\${AMBER}▶ Starting Camp Boss in tmux session...\${RESET}"

  # Create tmux session with Camp Boss
  cd "\$PROJECT_ROOT" || exit 1

  # Build the claude command
  local claude_cmd
  if [ -n "\$AGENT_FILE" ] && [ -f "\$AGENT_FILE" ]; then
    claude_cmd="STARTUP_BIN='\$STARTUP_BIN' STARTUP_ROLE=camp-boss claude --agent '\$AGENT_FILE' --dangerously-skip-permissions 'Start as Camp Boss - display your character greeting and load your journal'"
  else
    claude_cmd="STARTUP_BIN='\$STARTUP_BIN' STARTUP_ROLE=camp-boss claude --dangerously-skip-permissions"
  fi

  # Create detached tmux session
  tmux new-session -d -s "\$SESSION_NAME" -c "\$PROJECT_ROOT" "\\
    echo -e '\${AMBER}Camp Boss starting...\${RESET}'; \\
    \$claude_cmd; \\
    echo -e '\${DIM}Camp Boss exited. Press Enter to restart or Ctrl+D to close session.\${RESET}'; \\
    read -r; \\
    exec bash"

  echo -e "\${FG}✓ tmux session created: \$SESSION_NAME\${RESET}"
  sleep 1
}

attach_to_session() {
  if tmux has-session -t "\$SESSION_NAME" 2>/dev/null; then
    echo -e "\\n\${FG}▶ Attaching to Camp Boss...\${RESET}"
    echo -e "\${DIM}(Press Ctrl+b d to detach)\${RESET}"
    sleep 0.5
    tmux attach -t "\$SESSION_NAME"
    echo -e "\\n\${FG}◇ Detached from Camp Boss\${RESET}"
    sleep 1
  else
    echo -e "\\n\${AMBER}⚠ No active Camp Boss session\${RESET}"
    sleep 2
  fi
}

# MAIN LOOP
while true; do
  # Auto-attach if session exists
  if tmux has-session -t "\$SESSION_NAME" 2>/dev/null; then
    attach_to_session
    continue
  fi

  # Show panel if no session
  show_panel
  read -t 1 -n 1 key 2>/dev/null || key=""
  case "\$key" in
    s|S) start_camp_boss && attach_to_session ;;
    a|A) attach_to_session ;;
  esac
done
`;
}
