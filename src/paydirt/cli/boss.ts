// src/paydirt/cli/boss.ts

/**
 * Camp Boss daemon management commands.
 */

const BOSS_SESSION = 'pd-boss';
const BOSS_LOG_LABEL = 'pd:camp-boss';
const BOSS_LOG_TITLE = 'Camp Boss Command Log';

/**
 * Check if Camp Boss daemon is running.
 */
async function isDaemonRunning(): Promise<boolean> {
  const cmd = new Deno.Command('tmux', {
    args: ['has-session', '-t', BOSS_SESSION],
    stdout: 'null',
    stderr: 'null',
  });
  const result = await cmd.output();
  return result.success;
}

/**
 * Get paydirt binary path for spawning.
 */
function getPaydirtBin(): string {
  // Check for compiled binary first
  const cwdBin = `${Deno.cwd()}/paydirt`;
  try {
    Deno.statSync(cwdBin);
    return cwdBin;
  } catch {
    // Fall back to script
    return `deno run --allow-all ${Deno.cwd()}/paydirt.ts`;
  }
}

/**
 * Find or create the Camp Boss command log issue.
 */
async function ensureBossLog(): Promise<string | null> {
  // Try to find existing
  const findCmd = new Deno.Command('bd', {
    args: ['list', '--label', BOSS_LOG_LABEL, '--issue-type', 'epic', '--limit', '1'],
    stdout: 'piped',
    stderr: 'null',
  });

  const findResult = await findCmd.output();
  if (findResult.success) {
    const output = new TextDecoder().decode(findResult.stdout).trim();
    if (output) {
      const match = output.match(/^(\S+)\s+/);
      if (match) return match[1];
    }
  }

  // Create new
  const createCmd = new Deno.Command('bd', {
    args: [
      'create',
      '--title', BOSS_LOG_TITLE,
      '--type', 'epic',
      '--label', BOSS_LOG_LABEL,
    ],
    stdout: 'piped',
    stderr: 'piped',
  });

  const createResult = await createCmd.output();
  if (!createResult.success) return null;

  const output = new TextDecoder().decode(createResult.stdout).trim();
  const match = output.match(/Created issue:\s*(\S+)/);
  return match ? match[1] : null;
}

export interface BossOptions {
  subcommand: 'start' | 'stop' | 'status';
  dryRun?: boolean;
}

export async function bossCommand(options: BossOptions): Promise<void> {
  const { subcommand, dryRun } = options;

  switch (subcommand) {
    case 'start':
      await startDaemon(dryRun);
      break;
    case 'stop':
      await stopDaemon(dryRun);
      break;
    case 'status':
      await showStatus();
      break;
  }
}

async function startDaemon(dryRun?: boolean): Promise<void> {
  if (await isDaemonRunning()) {
    console.log('Camp Boss daemon is already running');
    console.log(`Attach with: tmux attach -t ${BOSS_SESSION}`);
    return;
  }

  // Ensure boss log exists
  const bossLogId = await ensureBossLog();
  if (bossLogId) {
    console.log(`Boss log: ${bossLogId}`);
  }

  const paydirtBin = getPaydirtBin();
  const projectDir = Deno.cwd();

  // Build command with boss log claim
  const claimArg = bossLogId ? ` --claim ${bossLogId}` : '';
  const command = `${paydirtBin} prospect camp-boss${claimArg} --background`;

  if (dryRun) {
    console.log('[DRY RUN] Would create tmux session:');
    console.log(`  Session: ${BOSS_SESSION}`);
    console.log(`  Command: ${command}`);
    return;
  }

  console.log('Starting Camp Boss daemon...');

  const cmd = new Deno.Command('tmux', {
    args: [
      'new-session',
      '-d',
      '-s', BOSS_SESSION,
      '-n', 'camp-boss',
      '-c', projectDir,
      command,
    ],
    stdout: 'piped',
    stderr: 'piped',
  });

  const result = await cmd.output();

  if (!result.success) {
    console.error('Failed to start Camp Boss daemon');
    console.error(new TextDecoder().decode(result.stderr));
    Deno.exit(1);
  }

  console.log('Camp Boss daemon started');
  console.log(`Session: ${BOSS_SESSION}`);
  console.log(`Attach with: pd attach boss`);
}

async function stopDaemon(dryRun?: boolean): Promise<void> {
  if (!(await isDaemonRunning())) {
    console.log('Camp Boss daemon is not running');
    return;
  }

  if (dryRun) {
    console.log('[DRY RUN] Would kill tmux session:', BOSS_SESSION);
    return;
  }

  console.log('Stopping Camp Boss daemon...');

  const cmd = new Deno.Command('tmux', {
    args: ['kill-session', '-t', BOSS_SESSION],
    stdout: 'null',
    stderr: 'piped',
  });

  const result = await cmd.output();

  if (!result.success) {
    console.error('Failed to stop Camp Boss daemon');
    Deno.exit(1);
  }

  console.log('Camp Boss daemon stopped');
}

async function showStatus(): Promise<void> {
  const running = await isDaemonRunning();

  console.log('Camp Boss Daemon Status');
  console.log('=======================');
  console.log(`Status: ${running ? 'RUNNING' : 'STOPPED'}`);
  console.log(`Session: ${BOSS_SESSION}`);

  if (running) {
    console.log('');
    console.log('Commands:');
    console.log('  pd boss stop     Stop the daemon');
    console.log('  pd attach boss   Attach to daemon session');
  } else {
    console.log('');
    console.log('Commands:');
    console.log('  pd boss start    Start the daemon');
  }
}
