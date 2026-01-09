// src/paydirt/boomtown/dashboard.ts

/**
 * Dashboard launcher for Paydirt Boomtown.
 * Uses mprocs to provide a TUI overview of all running Caravans.
 *
 * Supports hot-reload: When a new Caravan is created, the dashboard
 * can be reloaded to show the new Caravan without losing Camp Boss.
 *
 * Reference: gastown_b/src/dashboard/dashboard.ts
 */

import { join } from 'https://deno.land/std@0.208.0/path/mod.ts';
import {
  type CaravanStatus,
  type DashboardCaravanInfo,
  generateMprocsConfig,
  writeMprocsConfig,
} from './mprocs.ts';
import { generateCampBossScriptContent } from './camp-boss-pane.ts';

/**
 * Caravan information from bd CLI.
 * This is a simplified type for use in dashboard - the actual bd CLI
 * may return additional fields.
 */
export interface CaravanInfo {
  id: string;
  title: string;
  status: 'open' | 'in_progress' | 'closed';
  labels: string[];
  priority: number;
  created_at: string;
}

// Reload trigger file - when this exists, dashboard will reload
export const RELOAD_TRIGGER_FILE = '/tmp/paydirt-boomtown-reload';

/**
 * Find the paydirt binary path.
 *
 * Checks:
 * 1. ${CWD}/paydirt (compiled binary in project)
 * 2. paydirt in PATH
 *
 * @returns Full path to paydirt binary
 * @throws If paydirt cannot be found
 */
export async function findPaydirtPath(): Promise<string> {
  // Try local compiled binary first
  const localPath = join(Deno.cwd(), 'paydirt');
  try {
    const stat = await Deno.stat(localPath);
    if (stat.isFile) {
      return localPath;
    }
  } catch {
    // Not found locally, try PATH
  }

  // Try finding in PATH
  const whichCmd = new Deno.Command('which', {
    args: ['paydirt'],
    stdout: 'piped',
    stderr: 'null',
  });
  const result = await whichCmd.output();
  if (result.success) {
    const path = new TextDecoder().decode(result.stdout).trim();
    if (path) {
      return path;
    }
  }

  throw new Error(
    'paydirt binary not found. Run "deno compile --allow-all --output=paydirt paydirt.ts" first.',
  );
}

/**
 * Map bd Caravan status to dashboard status based on tmux session presence.
 *
 * @param caravan - Caravan info from bd
 * @param tmuxSessions - List of active paydirt tmux session names
 * @returns Dashboard status
 */
export function mapCaravanStatus(caravan: CaravanInfo, tmuxSessions: string[]): CaravanStatus {
  const expectedSession = `paydirt-${caravan.id}`;
  const hasSession = tmuxSessions.includes(expectedSession);

  if (hasSession) {
    return 'running';
  }

  // No tmux session - check if Caravan is open (idle) or closed (stopped)
  if (caravan.status === 'open' || caravan.status === 'in_progress') {
    return 'idle';
  }

  return 'stopped';
}

/**
 * Convert bd Caravan info to dashboard Caravan info.
 *
 * @param caravans - List of bd Caravan info
 * @param tmuxSessions - List of active paydirt tmux session names
 * @returns List of dashboard Caravan info
 */
export function mapCaravansToDashboard(
  caravans: CaravanInfo[],
  tmuxSessions: string[],
): DashboardCaravanInfo[] {
  return caravans.map((caravan) => ({
    id: caravan.id,
    name: caravan.title,
    status: mapCaravanStatus(caravan, tmuxSessions),
  }));
}

/**
 * Request a dashboard reload.
 * Creates a trigger file that the dashboard loop will detect.
 */
export async function requestDashboardReload(): Promise<void> {
  await Deno.writeTextFile(RELOAD_TRIGGER_FILE, new Date().toISOString());
  console.log('Dashboard reload requested');
}

/**
 * Check if a reload has been requested.
 */
async function checkReloadRequested(): Promise<boolean> {
  try {
    await Deno.stat(RELOAD_TRIGGER_FILE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear the reload request.
 */
async function clearReloadRequest(): Promise<void> {
  try {
    await Deno.remove(RELOAD_TRIGGER_FILE);
  } catch {
    // Ignore if doesn't exist
  }
}

/**
 * List tmux sessions (stub - will be replaced by tmux/operations.ts).
 * Returns session names for paydirt-prefixed sessions.
 */
async function listTmuxSessions(): Promise<string[]> {
  try {
    const cmd = new Deno.Command('tmux', {
      args: ['list-sessions', '-F', '#{session_name}'],
      stdout: 'piped',
      stderr: 'null',
    });
    const result = await cmd.output();
    if (!result.success) {
      return [];
    }
    const output = new TextDecoder().decode(result.stdout);
    return output.trim().split('\n').filter((s) => s.startsWith('paydirt-'));
  } catch {
    return [];
  }
}

/**
 * List Caravans from bd CLI (stub - will be replaced by bd-cli/mod.ts).
 * Returns open Caravans with the paydirt:caravan label.
 */
async function listCaravans(_status?: string): Promise<CaravanInfo[]> {
  try {
    const cmd = new Deno.Command('bd', {
      args: ['list', '--label', 'paydirt:caravan', '--status', 'open', '--brief'],
      stdout: 'piped',
      stderr: 'null',
    });
    const result = await cmd.output();
    if (!result.success) {
      return [];
    }
    const output = new TextDecoder().decode(result.stdout);
    // Parse bd list output - format: "id: title"
    const lines = output.trim().split('\n').filter((l) => l.trim());
    const caravans: CaravanInfo[] = [];
    for (const line of lines) {
      const match = line.match(/^(\S+):\s+(.+)$/);
      if (match) {
        caravans.push({
          id: match[1],
          title: match[2],
          status: 'open',
          labels: ['paydirt:caravan'],
          priority: 2,
          created_at: new Date().toISOString(),
        });
      }
    }
    return caravans;
  } catch {
    return [];
  }
}

/**
 * Generate dashboard config and return the config path.
 */
async function generateDashboardConfig(paydirtPath: string): Promise<string> {
  // Get open Caravans from bd
  let caravans: CaravanInfo[] = [];
  try {
    caravans = await listCaravans('open');
  } catch (error) {
    // bd may not be initialized - that's OK, show empty dashboard
    console.error('Note: Could not list Caravans:', (error as Error).message);
  }

  // Get active tmux sessions
  const tmuxSessions = await listTmuxSessions();

  // Map Caravans to dashboard format
  const dashboardCaravans = mapCaravansToDashboard(caravans, tmuxSessions);

  console.log(`Found ${dashboardCaravans.length} Caravan(s)`);
  for (const caravan of dashboardCaravans) {
    console.log(`  - ${caravan.name} (${caravan.id}): ${caravan.status}`);
  }

  // Generate and write mprocs config
  return await writeMprocsConfig(dashboardCaravans, paydirtPath);
}

/**
 * Launch the mprocs dashboard (Boomtown).
 *
 * Gets open Caravans and their tmux session status, generates an mprocs
 * configuration, and launches mprocs with that configuration.
 *
 * Supports hot-reload: The dashboard runs in a loop. When mprocs exits,
 * it checks for a reload trigger file. If found, it regenerates the
 * config and relaunches mprocs. This allows new Caravans to appear
 * without losing the Camp Boss conversation (which runs in tmux).
 *
 * Note: mprocs only "attaches" to tmux sessions - closing mprocs
 * leaves the sessions running.
 */
export async function launchBoomtown(): Promise<void> {
  console.log('Launching Paydirt Boomtown dashboard...');

  // Find paydirt binary path
  let paydirtPath: string;
  try {
    paydirtPath = await findPaydirtPath();
    console.log(`Using paydirt at: ${paydirtPath}`);
  } catch (error) {
    console.error((error as Error).message);
    Deno.exit(1);
  }

  // Clear any stale reload requests
  await clearReloadRequest();

  // Dashboard loop - supports hot reload
  while (true) {
    // Generate config
    const configPath = await generateDashboardConfig(paydirtPath);

    console.log(`Starting mprocs...`);

    // Launch mprocs with interactive terminal
    const process = new Deno.Command('mprocs', {
      args: ['--config', configPath],
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    });

    try {
      const status = await process.output();

      // Clean up temp config
      try {
        await Deno.remove(configPath);
        const tempDir = configPath.substring(0, configPath.lastIndexOf('/'));
        await Deno.remove(tempDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }

      // Check if reload was requested
      const reloadRequested = await checkReloadRequested();
      if (reloadRequested) {
        console.log('\nReloading dashboard...\n');
        await clearReloadRequest();
        continue; // Restart the loop with new config
      }

      // Normal exit
      if (!status.success) {
        console.error('mprocs exited with error');
        Deno.exit(status.code);
      }

      // User quit mprocs normally - exit dashboard
      break;
    } catch (error) {
      if ((error as Error).message.includes('No such file')) {
        console.error('Error: mprocs not found. Install it with: brew install mprocs');
        Deno.exit(1);
      }
      throw error;
    }
  }
}

// Re-export types and functions for convenience
export type { CaravanStatus, DashboardCaravanInfo };
export { generateMprocsConfig, writeMprocsConfig };
export { generateCampBossScriptContent };
