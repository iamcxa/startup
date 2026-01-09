// src/paydirt/cli/list.ts

/**
 * List all Paydirt tmux sessions.
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

    // Filter to paydirt sessions only
    if (!name.startsWith('paydirt-') && name !== 'pd-boss') continue;

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
    console.log('No Paydirt sessions found');
    console.log('');
    console.log('Start a Caravan with: pd stake "task"');
    console.log('Or start Camp Boss with: pd boss start');
    return;
  }

  console.log('Paydirt Sessions');
  console.log('================');
  console.log('');

  for (const session of sessions) {
    const type = session.name === 'pd-boss' ? 'daemon' : 'caravan';
    const status = session.attached ? '(attached)' : '';
    console.log(`${session.name} [${type}] ${status}`);
    console.log(`  Windows: ${session.windows}`);
    console.log(`  Created: ${session.created}`);
    console.log('');
  }

  console.log('Commands:');
  console.log('  pd attach <name>  Attach to session');
  console.log('  pd abandon <id>   Stop a Caravan');
  console.log('  pd boss stop      Stop Camp Boss daemon');
}
