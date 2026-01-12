// src/startup/boomtown/mprocs.ts
/**
 * mprocs configuration generator for Startup Boomtown dashboard.
 * Generates YAML configuration for mprocs TUI to manage Caravan sessions.
 *
 * Design: GOLD RUSH / WESTERN FRONTIER AESTHETIC
 * - Mining camp banner with gold nuggets (ASCII art)
 * - Lantern-style status indicators
 * - Pickaxe frame patterns
 * - Dark brown/gold color scheme
 *
 * Reference: gastown_b/src/dashboard/mprocs.ts (Soviet/Industrial theme)
 */

import { generateCampBossScriptContent } from './camp-boss-pane.ts';

/**
 * Status of a Caravan for dashboard display.
 */
export type CaravanStatus = 'running' | 'stopped' | 'idle';

/**
 * Caravan information for dashboard display.
 */
export interface DashboardCaravanInfo {
  id: string;
  name: string;
  status: CaravanStatus;
}

/**
 * Generate the Control Room (Assay Office) status display script.
 * Creates a gold rush themed ASCII dashboard with real-time updates.
 *
 * Features:
 * - Animated spinning indicator
 * - System status panel (timestamp, runtime, platform)
 * - Caravan stats panel (active, idle, total counts from bd)
 * - Mprocs controls reference
 */
export function generateStatusScriptContent(): string {
  return `#!/bin/bash
# ========================================================================
# STARTUP BOOMTOWN - Assay Office (Control Room)
# Gold Rush / Western Frontier Aesthetic
# ========================================================================

# ANSI Color Codes - Gold Rush Theme
BG="\\033[48;5;94m"        # Dark brown background
FG="\\033[38;5;220m"       # Gold foreground
AMBER="\\033[38;5;214m"    # Amber accent
DIM="\\033[38;5;137m"      # Dim tan
BOLD="\\033[1m"
RESET="\\033[0m"

# Session timing
SESSION_START=\$(date +%s)

# Spinner animation frames
SPIN=('◐' '◓' '◑' '◒')
FRAME=0

set_background() {
  echo -ne "\${BG}"
  clear
}

print_header() {
  echo -e "\${BG}\${FG}"
  echo "  ██████╗  █████╗ ██╗   ██╗██████╗ ██╗██████╗ ████████╗"
  echo "  ██╔══██╗██╔══██╗╚██╗ ██╔╝██╔══██╗██║██╔══██╗╚══██╔══╝"
  echo "  ██████╔╝███████║ ╚████╔╝ ██║  ██║██║██████╔╝   ██║   "
  echo "  ██╔═══╝ ██╔══██║  ╚██╔╝  ██║  ██║██║██╔══██╗   ██║   "
  echo "  ██║     ██║  ██║   ██║   ██████╔╝██║██║  ██║   ██║   "
  echo "  ╚═╝     ╚═╝  ╚═╝   ╚═╝   ╚═════╝ ╚═╝╚═╝  ╚═╝   ╚═╝   "
  echo ""
  echo -e "\${AMBER} ⛏────────────────────────────────────────────────────────────────────⛏"
  echo -e " │\${BOLD}  B O O M T O W N   -   M U L T I - A G E N T   O R C H E S T R A T O R\${AMBER} │"
  echo -e " ⛏────────────────────────────────────────────────────────────────────⛏"
}

print_system_panel() {
  local spin=\${SPIN[\$FRAME]}
  local time=\$(date '+%Y-%m-%d %H:%M:%S')
  local now=\$(date +%s)
  local elapsed=\$((now - SESSION_START))
  local hours=\$((elapsed / 3600))
  local mins=\$(( (elapsed % 3600) / 60 ))
  local secs=\$((elapsed % 60))
  local runtime_str=\$(printf "%02d:%02d:%02d" \$hours \$mins \$secs)

  echo ""
  echo -e "\${FG} ╔══════════════════════════════════════════════════════════════════════╗"
  echo -e " ║  \${AMBER}\$spin MINING CAMP STATUS\${FG}                                            ║"
  echo -e " ╠══════════════════════════════════════════════════════════════════════╣"
  printf " ║  \${DIM}◆ TIMESTAMP    │\${RESET}\${BG}\${FG} %-40s\${FG}         ║\\n" "\$time"
  printf " ║  \${DIM}◆ RUNTIME      │\${RESET}\${BG}\${FG} %-40s\${FG}         ║\\n" "\$runtime_str"
  printf " ║  \${DIM}◆ PLATFORM     │\${RESET}\${BG}\${FG} %-40s\${FG}         ║\\n" "\$(uname -s) \$(uname -m)"
  echo -e " ╚══════════════════════════════════════════════════════════════════════╝"
}

print_caravan_stats() {
  local active=0
  local idle=0

  # Query bd for Caravan counts
  if command -v bd &> /dev/null; then
    active=\$(bd list --label pd:caravan --status in_progress 2>/dev/null | wc -l | tr -d ' ')
    idle=\$(bd list --label pd:caravan --status open 2>/dev/null | wc -l | tr -d ' ')
  fi

  local total=\$((active + idle))

  echo ""
  echo -e "\${FG} ╔══════════════════════════════════════════════════════════════════════╗"
  echo -e " ║  \${AMBER}◆ CARAVAN STATUS\${FG}                                                    ║"
  echo -e " ╠══════════════════════════════════════════════════════════════════════╣"
  printf " ║  Active: \${AMBER}%-4s\${FG} │  Idle: \${DIM}%-4s\${FG} │  Total: %-4s                       ║\\n" "\$active" "\$idle" "\$total"
  echo -e " ╚══════════════════════════════════════════════════════════════════════╝"
}

print_controls_panel() {
  echo ""
  echo -e "\${FG} ╔══════════════════════════════════════════════════════════════════════╗"
  echo -e " ║  \${AMBER}◆ ZELLIJ CONTROLS\${FG}                                                    ║"
  echo -e " ╠════════════════════╦════════════════════╦════════════════════════════╣"
  echo -e " ║  [C-p] Pane Mode   ║  [C-t] Tab Mode    ║  [C-q] Exit Boomtown       ║"
  echo -e " ║  [←↑↓→] Navigate   ║  [n] New Tab       ║  [x] Close Tab             ║"
  echo -e " ╚════════════════════╩════════════════════╩════════════════════════════╝"
  echo -e "\${RESET}"
}

print_new_caravan_alert() {
  if [ -f /tmp/startup-new-caravans ]; then
    local new_caravans=\$(cat /tmp/startup-new-caravans 2>/dev/null | tail -3)
    if [ -n "\$new_caravans" ]; then
      echo ""
      echo -e "\${AMBER} ╔══════════════════════════════════════════════════════════════════════╗"
      echo -e " ║  ⚠ NEW CARAVAN(S) DETECTED - Press [q] then relaunch to see         ║"
      echo -e " ╠══════════════════════════════════════════════════════════════════════╣"
      while IFS= read -r line; do
        printf " ║  %-66s  ║\\n" "\$line"
      done <<< "\$new_caravans"
      echo -e " ╚══════════════════════════════════════════════════════════════════════╝\${FG}"
    fi
  fi
}

# Main loop - updates every 2 seconds
while true; do
  set_background
  print_header
  print_system_panel
  print_caravan_stats
  print_new_caravan_alert
  print_controls_panel
  FRAME=\$(( (FRAME + 1) % 4 ))
  sleep 2
done
`;
}

/**
 * Generate Caravan pane script for a specific Caravan.
 * Prioritizes direct tmux attach for real-time agent visibility.
 *
 * Behavior:
 * - If tmux session exists: attach directly (show Claude Code)
 * - If no session: show waiting screen with [s] to start
 * - After detach (Ctrl+b d): loop continues, checking for session
 *
 * @param caravanId - Caravan ID (e.g., 'pd-abc123')
 * @param caravanName - Display name for the Caravan
 * @param status - Current Caravan status
 * @param startupPath - Full path to startup binary
 */
export function generateCaravanScriptContent(
  caravanId: string,
  caravanName: string,
  _status: CaravanStatus,
  startupPath: string,
): string {
  const sessionName = `startup-${caravanId}`;
  const safeName = caravanName.replace(/"/g, '\\"').substring(0, 42);
  const safeId = caravanId.substring(0, 20);

  return `#!/bin/bash
# STARTUP BOOMTOWN - Caravan Pane
# Direct tmux attach with fallback to detail view

SESSION_NAME="${sessionName}"
CARAVAN_ID="${safeId}"
CARAVAN_NAME="${safeName}"
STARTUP_BIN="${startupPath}"

# Colors
AMBER="\\033[38;5;214m"
FG="\\033[38;5;156m"
DIM="\\033[38;5;242m"
RESET="\\033[0m"

show_waiting() {
  clear
  echo -e "\${AMBER}"
  echo "  ╔════════════════════════════════════════════════════════════╗"
  echo -e "  ║  CARAVAN: \${FG}\$CARAVAN_NAME\${AMBER}"
  echo "  ╠════════════════════════════════════════════════════════════╣"
  echo -e "  ║  ID: \$CARAVAN_ID"
  echo -e "  ║  Session: \$SESSION_NAME"
  echo "  ╠════════════════════════════════════════════════════════════╣"
  echo -e "  ║  \${FG}[s]\${AMBER} START - Launch Trail Boss"
  echo -e "  ║  \${DIM}Waiting for session...\${AMBER}"
  echo "  ╚════════════════════════════════════════════════════════════╝"
  echo -e "\${RESET}"
}

start_caravan() {
  echo -e "\\n\${AMBER}Starting caravan...\${RESET}"
  "\$STARTUP_BIN" continue "\$CARAVAN_ID" &
  sleep 2
}

# Main loop
while true; do
  if tmux has-session -t "\$SESSION_NAME" 2>/dev/null; then
    # Session exists - attach directly
    tmux attach -t "\$SESSION_NAME"
    # After detach, loop continues
    sleep 1
  else
    # No session - show waiting screen
    show_waiting
    read -t 2 -n 1 key 2>/dev/null || key=""
    case "\$key" in
      s|S) start_caravan ;;
    esac
  fi
done
`;
}

/**
 * Generate welcome message script content for empty dashboard.
 * Shows available operations when no Caravans exist.
 * Returns a standalone bash script (not inline commands).
 */
export function generateWelcomeScript(): string {
  return `#!/bin/bash
# Welcome panel for Boomtown when no Caravans exist

while true; do
  clear
  echo ""
  echo " ╔════════════════════════════════════════════════════════════════╗"
  echo " ║                                                                ║"
  echo " ║   ██████╗  █████╗ ██╗   ██╗██████╗ ██╗██████╗ ████████╗       ║"
  echo " ║   ██╔══██╗██╔══██╗╚██╗ ██╔╝██╔══██╗██║██╔══██╗╚══██╔══╝       ║"
  echo " ║   ██████╔╝███████║ ╚████╔╝ ██║  ██║██║██████╔╝   ██║          ║"
  echo " ║   ██╔═══╝ ██╔══██║  ╚██╔╝  ██║  ██║██║██╔══██╗   ██║          ║"
  echo " ║   ██║     ██║  ██║   ██║   ██████╔╝██║██║  ██║   ██║          ║"
  echo " ║   ╚═╝     ╚═╝  ╚═╝   ╚═╝   ╚═════╝ ╚═╝╚═╝  ╚═╝   ╚═╝          ║"
  echo " ║                                                                ║"
  echo " ╠════════════════════════════════════════════════════════════════╣"
  echo " ║  ◇ WELCOME TO BOOMTOWN                                         ║"
  echo " ╠════════════════════════════════════════════════════════════════╣"
  echo " ║                                                                ║"
  echo " ║   No active Caravans detected.                                 ║"
  echo " ║                                                                ║"
  echo " ║   ┌──────────────────────────────────────────────────────┐     ║"
  echo " ║   │  AVAILABLE OPERATIONS                                │     ║"
  echo " ║   ├──────────────────────────────────────────────────────┤     ║"
  echo " ║   │                                                      │     ║"
  echo " ║   │  ▶ START NEW CARAVAN                                 │     ║"
  echo ' ║   │    startup call "Your task description"            │     ║'
  echo " ║   │                                                      │     ║"
  echo " ║   │  ◇ RESUME EXISTING CARAVAN                           │     ║"
  echo " ║   │    startup continue <caravan-id>                     │     ║"
  echo " ║   │                                                      │     ║"
  echo " ║   │  ■ LIST ALL CARAVANS                                 │     ║"
  echo " ║   │    startup survey                                    │     ║"
  echo " ║   │                                                      │     ║"
  echo " ║   └──────────────────────────────────────────────────────┘     ║"
  echo " ║                                                                ║"
  echo " ╚════════════════════════════════════════════════════════════════╝"
  echo ""
  read -r -p " Press any key to refresh... " -n1 -s
done
`;
}

/**
 * Generate mprocs YAML configuration for Boomtown dashboard.
 *
 * Configuration structure:
 * - Global settings (proc_list_width, scrollback, server)
 * - Control Room (Assay Office) - status overview
 * - Camp Boss pane - human interface
 * - Caravan panes - one per active Caravan
 * - Welcome pane (when no Caravans)
 *
 * @param caravans - List of Caravan info objects
 * @param statusScriptPath - Path to Control Room status script
 * @param caravanScriptPaths - Map of Caravan ID to pane script path
 * @param campBossScriptPath - Path to Camp Boss pane script
 * @param welcomeScriptPath - Path to Welcome pane script (used when no Caravans)
 * @returns YAML configuration string
 */
export function generateMprocsConfig(
  caravans: DashboardCaravanInfo[],
  statusScriptPath?: string,
  caravanScriptPaths?: Map<string, string>,
  campBossScriptPath?: string,
  welcomeScriptPath?: string,
): string {
  const lines: string[] = [];

  // YAML header with Gold Rush branding
  lines.push('# ========================================================================');
  lines.push('#  ██████╗  █████╗ ██╗   ██╗██████╗ ██╗██████╗ ████████╗');
  lines.push('# ██╔══██╗██╔══██╗╚██╗ ██╔╝██╔══██╗██║██╔══██╗╚══██╔══╝');
  lines.push('# ██████╔╝███████║ ╚████╔╝ ██║  ██║██║██████╔╝   ██║');
  lines.push('# ██╔═══╝ ██╔══██║  ╚██╔╝  ██║  ██║██║██╔══██╗   ██║');
  lines.push('# ██║     ██║  ██║   ██║   ██████╔╝██║██║  ██║   ██║');
  lines.push('#  ╚═╝     ╚═╝  ╚═╝   ╚═╝   ╚═════╝ ╚═╝╚═╝  ╚═╝   ╚═╝');
  lines.push('# ========================================================================');
  lines.push('# BOOMTOWN - Multi-Agent Orchestrator Dashboard');
  lines.push('# ========================================================================');
  lines.push('');

  // Global mprocs settings
  lines.push('# ┌─────────────────────────────────────────────────────────────────────────────┐');
  lines.push('# │ GLOBAL CONFIGURATION                                                       │');
  lines.push('# └─────────────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  lines.push('proc_list_width: 24');
  lines.push('scrollback: 5000');
  lines.push('mouse_scroll_speed: 3');
  lines.push('hide_keymap_window: true');
  lines.push('');
  lines.push('# Remote control server for automation');
  lines.push('server: "127.0.0.1:4051"');
  lines.push('');

  // Process definitions
  lines.push('# ┌─────────────────────────────────────────────────────────────────────────────┐');
  lines.push('# │ PROCESS DEFINITIONS                                                        │');
  lines.push('# └─────────────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  lines.push('procs:');

  // Control Room (Assay Office)
  lines.push('');
  lines.push('  # ========================================================================');
  lines.push('  # CONTROL ROOM (Assay Office) - System Status Overview');
  lines.push('  # ========================================================================');
  lines.push('  "◆ CONTROL ROOM":');
  if (statusScriptPath) {
    lines.push(`    shell: "bash ${statusScriptPath}"`);
  } else {
    lines.push(
      `    shell: "bash -c 'while true; do clear; echo \\"STARTUP BOOMTOWN\\"; date; sleep 2; done'"`,
    );
  }
  lines.push('    autorestart: true');

  // Camp Boss pane
  lines.push('');
  lines.push('  # ========================================================================');
  lines.push('  # CAMP BOSS - Strategic Control Interface');
  lines.push('  # ========================================================================');
  lines.push('  "⛺ CAMP BOSS":');
  if (campBossScriptPath) {
    lines.push(`    shell: "bash ${campBossScriptPath}"`);
  } else {
    lines.push(
      `    shell: "bash -c 'while true; do clear; echo \\"CAMP BOSS - Press s to start\\"; read -t 1 -n 1 key; done'"`,
    );
  }
  lines.push('    autorestart: true');

  // Caravan panes or Welcome panel
  if (caravans.length > 0) {
    lines.push('');
    lines.push('  # ========================================================================');
    lines.push('  # CARAVAN SESSIONS');
    lines.push('  # ========================================================================');

    for (const caravan of caravans) {
      const sessionName = `startup-${caravan.id}`;
      const statusGlyph = caravan.status === 'running'
        ? '▶'
        : caravan.status === 'idle'
        ? '◇'
        : '■';
      const paneLabel = caravan.id.substring(0, 18);

      lines.push('');
      lines.push(`  "${statusGlyph} ${paneLabel}":`);

      const scriptPath = caravanScriptPaths?.get(caravan.id);
      if (scriptPath) {
        lines.push(`    shell: "tmux attach -t ${sessionName} 2>/dev/null || bash ${scriptPath}"`);
      } else {
        lines.push(
          `    shell: "tmux attach -t ${sessionName} 2>/dev/null || bash -c 'while true; do clear; echo \\"Caravan: ${caravan.id}\\"; echo \\"Status: ${caravan.status}\\"; read -t 1 -n 1 key; done'"`,
        );
      }
    }
  } else {
    // Welcome pane when no Caravans
    lines.push('');
    lines.push('  # ========================================================================');
    lines.push('  # WELCOME PANEL - Getting Started');
    lines.push('  # ========================================================================');
    lines.push('  "◇ WELCOME":');
    if (welcomeScriptPath) {
      lines.push(`    shell: "bash ${welcomeScriptPath}"`);
    } else {
      lines.push(
        `    shell: "bash -c 'while true; do clear; echo \\"WELCOME TO BOOMTOWN\\"; echo \\"No active Caravans detected.\\"; echo \\"Run: startup call task\\"; sleep 3; done'"`,
      );
    }
  }

  lines.push('');

  return lines.join('\n') + '\n';
}

/**
 * Write mprocs configuration and supporting scripts to temp directory.
 *
 * @param caravans - List of Caravan info objects
 * @param startupPath - Full path to startup binary
 * @param projectRoot - Optional project root for Camp Boss
 * @returns Path to the created config file
 */
export async function writeMprocsConfig(
  caravans: DashboardCaravanInfo[],
  startupPath: string,
  projectRoot?: string,
): Promise<string> {
  const tempDir = await Deno.makeTempDir({ prefix: 'startup-boomtown-' });
  const effectiveProjectRoot = projectRoot || Deno.cwd();

  // Write Control Room status script
  const statusScriptPath = `${tempDir}/control-room.sh`;
  await Deno.writeTextFile(statusScriptPath, generateStatusScriptContent());
  await Deno.chmod(statusScriptPath, 0o755);

  // Write Camp Boss script
  const campBossScriptPath = `${tempDir}/camp-boss.sh`;
  const campBossAgentPath = `${effectiveProjectRoot}/prospects/camp-boss.md`;
  await Deno.writeTextFile(
    campBossScriptPath,
    generateCampBossScriptContent(startupPath, campBossAgentPath, effectiveProjectRoot),
  );
  await Deno.chmod(campBossScriptPath, 0o755);

  // Write Caravan detail scripts
  const caravanScriptPaths = new Map<string, string>();
  for (const caravan of caravans) {
    const scriptPath = `${tempDir}/caravan-${caravan.id}.sh`;
    const scriptContent = generateCaravanScriptContent(
      caravan.id,
      caravan.name,
      caravan.status,
      startupPath,
    );
    await Deno.writeTextFile(scriptPath, scriptContent);
    await Deno.chmod(scriptPath, 0o755);
    caravanScriptPaths.set(caravan.id, scriptPath);
  }

  // Write Welcome script (used when no Caravans)
  let welcomeScriptPath: string | undefined;
  if (caravans.length === 0) {
    welcomeScriptPath = `${tempDir}/welcome.sh`;
    await Deno.writeTextFile(welcomeScriptPath, generateWelcomeScript());
    await Deno.chmod(welcomeScriptPath, 0o755);
  }

  // Generate and write mprocs config
  const config = generateMprocsConfig(
    caravans,
    statusScriptPath,
    caravanScriptPaths,
    campBossScriptPath,
    welcomeScriptPath,
  );
  const configPath = `${tempDir}/mprocs.yaml`;
  await Deno.writeTextFile(configPath, config);

  return configPath;
}
