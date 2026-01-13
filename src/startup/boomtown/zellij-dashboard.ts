// src/startup/boomtown/zellij-dashboard.ts
/**
 * Zellij-based Startup dashboard launcher.
 * Uses pure Zellij sessions (no tmux intermediary).
 */

import {
  attachSession,
  createBackgroundSession,
  deleteSession,
  getSessionState,
  SESSION_PREFIX,
} from './zellij-session.ts';

/** Session name for the legacy Startup dashboard (deprecated - use startup-company) */
const STARTUP_SESSION = `${SESSION_PREFIX}dashboard`;

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

  // Create background session then attach
  const success = await createBackgroundSession(STARTUP_SESSION, {
    layoutPath,
  });
  if (!success) {
    console.error('Failed to create zellij session');
    Deno.exit(1);
  }

  console.log('Attaching to session...');
  console.log('  (Press Ctrl+o d to detach)');
  console.log('  (Press Ctrl+s to scroll)\n');

  await attachSession(STARTUP_SESSION);
  console.log('Startup dashboard session ended.');
}
