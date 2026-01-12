// src/startup/boomtown/zellij-dashboard.ts
/**
 * Zellij-based Boomtown dashboard launcher.
 * Replaces mprocs for dynamic caravan pane management.
 */

import { findStartupPath } from './dashboard.ts';
import { generateCampBossScriptContent } from './camp-boss-pane.ts';
import { generateStatusScriptContent } from './mprocs.ts';
import {
  BOOMTOWN_SESSION,
  generateBoomtownLayout,
  sessionExists,
  attachSession,
  createSession,
} from './zellij.ts';

/**
 * Launch Boomtown with zellij.
 *
 * Features:
 * - Creates zellij session with Control Room + Camp Boss layout
 * - Attaches to existing session if already running
 * - Adds tabs for existing caravans on first launch
 * - New caravans are added dynamically via stake command
 */
export async function launchZellijBoomtown(): Promise<void> {
  console.log('Launching Startup Boomtown (zellij)...');

  // Check if session already exists
  if (await sessionExists(BOOMTOWN_SESSION)) {
    console.log(`Session ${BOOMTOWN_SESSION} exists, attaching...`);
    await attachSession(BOOMTOWN_SESSION);
    return;
  }

  // Find startup binary
  let startupPath: string;
  try {
    startupPath = await findStartupPath();
  } catch (error) {
    console.error((error as Error).message);
    Deno.exit(1);
  }

  const projectRoot = Deno.cwd();
  const tempDir = await Deno.makeTempDir({ prefix: 'startup-zellij-' });

  // Write Control Room script
  const controlRoomScript = `${tempDir}/control-room.sh`;
  await Deno.writeTextFile(controlRoomScript, generateStatusScriptContent());
  await Deno.chmod(controlRoomScript, 0o755);

  // Write Camp Boss script
  const campBossScript = `${tempDir}/camp-boss.sh`;
  const campBossAgentPath = `${projectRoot}/prospects/camp-boss.md`;
  await Deno.writeTextFile(
    campBossScript,
    generateCampBossScriptContent(startupPath, campBossAgentPath, projectRoot),
  );
  await Deno.chmod(campBossScript, 0o755);

  // Write layout file
  const layoutPath = `${tempDir}/boomtown.kdl`;
  await Deno.writeTextFile(
    layoutPath,
    generateBoomtownLayout(controlRoomScript, campBossScript),
  );

  console.log('Creating zellij session...');

  // Note: Existing caravans can be viewed in Control Room status panel
  // New caravans created via `stake` will automatically get tabs added

  // Create session interactively - blocks until user detaches/exits
  const success = await createSession(BOOMTOWN_SESSION, layoutPath);
  if (!success) {
    console.error('Failed to create zellij session');
    Deno.exit(1);
  }

  // Cleanup temp files after session exits
  try {
    await Deno.remove(tempDir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }

  console.log('Boomtown session ended.');
}
