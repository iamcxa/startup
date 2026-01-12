// src/startup/cli/list.ts

/**
 * List all Startup tmux sessions.
 */

interface SessionInfo {
  name: string;
  windows: number;
  created: string;
  attached: boolean;
}

async function getSessionInfo(): Promise<SessionInfo[]> {
  const cmd = new Deno.Command('tmux', {
    args: [
      'list-sessions',
      '-F',
      '#{session_name}|#{session_windows}|#{session_created}|#{session_attached}',
    ],
    stdout: 'piped',
    stderr: 'null',
  });

  const result = await cmd.output();
  if (!result.success) return [];

  const output = new TextDecoder().decode(result.stdout);
  const sessions: SessionInfo[] = [];

  for (const line of output.trim().split('\n')) {
    if (!line) continue;
    const [name, windows, created, attached] = line.split('|');

    // Filter to startup sessions only
    if (!name.startsWith('startup-') && name !== 'startup-company') continue;

    sessions.push({
      name,
      windows: parseInt(windows, 10),
      created: new Date(parseInt(created, 10) * 1000).toLocaleString(),
      attached: attached === '1',
    });
  }

  return sessions;
}

export async function listCommand(): Promise<void> {
  const sessions = await getSessionInfo();

  if (sessions.length === 0) {
    console.log('No Startup sessions found');
    console.log('');
    console.log('Start a Team with: startup kickoff "task"');
    console.log('Or start Company HQ with: startup company start');
    return;
  }

  console.log('Startup Sessions');
  console.log('================');
  console.log('');

  for (const session of sessions) {
    const type = session.name === 'startup-company' ? 'company' : 'team';
    const status = session.attached ? '(attached)' : '';
    console.log(`${session.name} [${type}] ${status}`);
    console.log(`  Windows: ${session.windows}`);
    console.log(`  Created: ${session.created}`);
    console.log('');
  }

  console.log('Commands:');
  console.log('  startup attach <name>  Attach to session');
  console.log('  startup abandon <id>   Stop a Team');
  console.log('  startup company stop   Stop Company HQ');
}
