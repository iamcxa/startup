// src/startup/boomtown/zellij-dashboard.ts
/**
 * Zellij-based Startup dashboard launcher.
 * Uses dual-layer architecture: Zellij (display) + Tmux (persistence).
 */

import {
  STARTUP_SESSION,
  getSessionState,
  attachSession,
  createSession,
  deleteSession,
} from './zellij.ts';

/**
 * Get the path to the startup-layout.kdl file.
 */
function getLayoutPath(): string {
  // Layout file is in the same directory as this module
  const moduleDir = new URL('.', import.meta.url).pathname;
  return `${moduleDir}startup-layout.kdl`;
}

/**
 * Launch Startup dashboard with zellij.
 *
 * Features:
 * - Creates zellij session with CTO tab
 * - Attaches to existing session if already running
 * - Team tabs added dynamically via hooks
 */
export async function launchZellijBoomtown(): Promise<void> {
  console.log('Launching Startup Dashboard (zellij)...');

  // Check session state
  const sessionState = await getSessionState(STARTUP_SESSION);

  if (sessionState === 'alive') {
    console.log(`Session ${STARTUP_SESSION} exists, attaching...`);
    await attachSession(STARTUP_SESSION);
    return;
  }

  if (sessionState === 'dead') {
    console.log(`Session ${STARTUP_SESSION} is dead, cleaning up...`);
    await deleteSession(STARTUP_SESSION);
  }

  // Get layout path
  const layoutPath = getLayoutPath();

  // Verify layout file exists
  try {
    await Deno.stat(layoutPath);
  } catch {
    console.error(`Layout file not found: ${layoutPath}`);
    console.error('Please ensure startup-layout.kdl exists in the boomtown directory.');
    Deno.exit(1);
  }

  console.log('Creating zellij session...');
  console.log(`Layout: ${layoutPath}`);

  // Create session - blocks until user exits
  const success = await createSession(STARTUP_SESSION, layoutPath);
  if (!success) {
    console.error('Failed to create zellij session');
    Deno.exit(1);
  }

  console.log('Startup dashboard session ended.');
}
