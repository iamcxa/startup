// src/startup/cli/attach.ts

/**
 * Attach to a Startup tmux session.
 */

export interface AttachOptions {
  target?: string;
}

/**
 * List all startup tmux sessions.
 */
async function listStartupSessions(): Promise<string[]> {
  const cmd = new Deno.Command('tmux', {
    args: ['list-sessions', '-F', '#{session_name}'],
    stdout: 'piped',
    stderr: 'null',
  });

  const result = await cmd.output();
  if (!result.success) return [];

  const output = new TextDecoder().decode(result.stdout);
  return output
    .trim()
    .split('\n')
    .filter((s) => s.startsWith('startup-') || s === 'pd-boss');
}

export async function attachCommand(options: AttachOptions): Promise<void> {
  const { target } = options;

  // If no target, list available sessions
  if (!target) {
    const sessions = await listStartupSessions();
    if (sessions.length === 0) {
      console.log('No Startup sessions found');
      console.log('Start a Caravan with: pd stake "task"');
      console.log('Or start Camp Boss with: pd boss start');
      return;
    }

    console.log('Available Startup sessions:');
    for (const session of sessions) {
      const label = session === 'pd-boss' ? '(Camp Boss daemon)' : '(Caravan)';
      console.log(`  ${session} ${label}`);
    }
    console.log('');
    console.log('Attach with: pd attach <session-name>');
    return;
  }

  // Resolve target to session name
  let sessionName: string;
  if (target === 'boss') {
    sessionName = 'pd-boss';
  } else if (target.startsWith('startup-')) {
    sessionName = target;
  } else {
    sessionName = `startup-${target}`;
  }

  // Check if session exists
  const cmd = new Deno.Command('tmux', {
    args: ['has-session', '-t', sessionName],
    stdout: 'null',
    stderr: 'null',
  });
  const check = await cmd.output();

  if (!check.success) {
    console.error(`Session not found: ${sessionName}`);
    const sessions = await listStartupSessions();
    if (sessions.length > 0) {
      console.log('Available sessions:', sessions.join(', '));
    }
    Deno.exit(1);
  }

  // Attach to session
  const attachCmd = new Deno.Command('tmux', {
    args: ['attach-session', '-t', sessionName],
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  await attachCmd.output();
}
