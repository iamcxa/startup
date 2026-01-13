// src/startup/cli/list.ts

/**
 * List all Startup Zellij sessions.
 */

import {
  COMPANY_SESSION,
  getTabNames,
  listStartupSessions,
  type SessionInfo,
} from '../boomtown/zellij-session.ts';

interface SessionDisplay {
  name: string;
  type: 'company' | 'team';
  state: 'alive' | 'dead';
  tabs: number;
  created?: string;
}

async function getSessionDisplay(): Promise<SessionDisplay[]> {
  const sessions = await listStartupSessions();
  const displays: SessionDisplay[] = [];

  for (const session of sessions) {
    // Get tab count for alive sessions
    let tabs = 0;
    if (session.state === 'alive') {
      const tabNames = await getTabNames(session.name);
      tabs = tabNames.length;
    }

    displays.push({
      name: session.name,
      type: session.name === COMPANY_SESSION ? 'company' : 'team',
      state: session.state,
      tabs,
      created: session.created,
    });
  }

  return displays;
}

export async function listCommand(): Promise<void> {
  const sessions = await getSessionDisplay();

  if (sessions.length === 0) {
    console.log('No Startup sessions found');
    console.log('');
    console.log('Start with: startup enter');
    console.log('Or start a Team with: startup stake "task"');
    return;
  }

  console.log('Startup Sessions');
  console.log('================');
  console.log('');

  for (const session of sessions) {
    const stateIcon = session.state === 'alive' ? '●' : '○';
    const stateText = session.state === 'dead' ? ' (dead)' : '';
    console.log(`${stateIcon} ${session.name} [${session.type}]${stateText}`);
    if (session.state === 'alive') {
      console.log(`  Tabs: ${session.tabs}`);
    }
    if (session.created) {
      console.log(`  Created: ${session.created}`);
    }
    console.log('');
  }

  console.log('Commands:');
  console.log('  startup attach <name>  Attach to session');
  console.log('  startup abandon <id>   Stop a Team');
  console.log('  startup enter          Start/attach to Company HQ');
}
