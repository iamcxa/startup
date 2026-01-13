// src/startup/cli/attach.ts

/**
 * Attach to a Startup Zellij session.
 */

import {
  attachSession,
  COMPANY_SESSION,
  listStartupSessions,
  sessionIsAlive,
} from '../boomtown/zellij-session.ts';

export interface AttachOptions {
  target?: string;
}

export async function attachCommand(options: AttachOptions): Promise<void> {
  const { target } = options;

  // If no target, list available sessions
  if (!target) {
    const sessions = await listStartupSessions();
    const aliveSessions = sessions.filter((s) => s.state === 'alive');

    if (aliveSessions.length === 0) {
      console.log('No Startup sessions found');
      console.log('Start with: startup enter');
      console.log('Or start a Team with: startup stake "task"');
      return;
    }

    console.log('Available Startup sessions:');
    for (const session of aliveSessions) {
      const label = session.name === COMPANY_SESSION ? '(Company HQ)' : '(Team)';
      console.log(`  ${session.name} ${label}`);
    }
    console.log('');
    console.log('Attach with: startup attach <session-name>');
    return;
  }

  // Resolve target to session name
  let sessionName: string;
  if (target === 'company') {
    sessionName = COMPANY_SESSION;
  } else if (target.startsWith('startup-')) {
    sessionName = target;
  } else {
    sessionName = `startup-${target}`;
  }

  // Check if session exists and is alive
  if (!(await sessionIsAlive(sessionName))) {
    console.error(`Session not found or not running: ${sessionName}`);
    const sessions = await listStartupSessions();
    const alive = sessions.filter((s) => s.state === 'alive');
    if (alive.length > 0) {
      console.log('Available sessions:', alive.map((s) => s.name).join(', '));
    }
    Deno.exit(1);
  }

  // Attach to session
  console.log(`Attaching to ${sessionName}...`);
  console.log(`  (Press Ctrl+o d to detach)`);
  console.log(`  (Press Ctrl+s to scroll)\n`);

  await attachSession(sessionName);
}
