// src/startup/cli/boss.ts

/**
 * Company HQ daemon management commands.
 */

const COMPANY_SESSION = 'startup-company';
const COMPANY_LOG_LABEL = 'st:company';
const COMPANY_LOG_TITLE = 'Company HQ Command Log';

/**
 * Check if Company HQ daemon is running.
 */
async function isDaemonRunning(): Promise<boolean> {
  const cmd = new Deno.Command('tmux', {
    args: ['has-session', '-t', COMPANY_SESSION],
    stdout: 'null',
    stderr: 'null',
  });
  const result = await cmd.output();
  return result.success;
}

/**
 * Get startup binary path for spawning.
 */
function getStartupBin(): string {
  // Check for compiled binary first
  const cwdBin = `${Deno.cwd()}/startup`;
  try {
    Deno.statSync(cwdBin);
    return cwdBin;
  } catch {
    // Fall back to script
    return `deno run --allow-all ${Deno.cwd()}/startup.ts`;
  }
}

/**
 * Find or create the Company HQ command log issue.
 */
async function ensureCompanyLog(): Promise<string | null> {
  // Try to find existing
  const findCmd = new Deno.Command('bd', {
    args: ['list', '--label', COMPANY_LOG_LABEL, '--issue-type', 'epic', '--limit', '1'],
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
      '--title', COMPANY_LOG_TITLE,
      '--type', 'epic',
      '--label', COMPANY_LOG_LABEL,
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
    console.log('Company HQ daemon is already running');
    console.log(`Attach with: tmux attach -t ${COMPANY_SESSION}`);
    return;
  }

  // Ensure company log exists
  const companyLogId = await ensureCompanyLog();
  if (companyLogId) {
    console.log(`Company log: ${companyLogId}`);
  }

  const startupBin = getStartupBin();
  const projectDir = Deno.cwd();

  // Build command with company log claim
  const claimArg = companyLogId ? ` --claim ${companyLogId}` : '';
  const command = `${startupBin} call cto${claimArg} --background`;

  if (dryRun) {
    console.log('[DRY RUN] Would create tmux session:');
    console.log(`  Session: ${COMPANY_SESSION}`);
    console.log(`  Command: ${command}`);
    return;
  }

  console.log('Starting Company HQ daemon...');

  const cmd = new Deno.Command('tmux', {
    args: [
      'new-session',
      '-d',
      '-s', COMPANY_SESSION,
      '-n', 'company',
      '-c', projectDir,
      command,
    ],
    stdout: 'piped',
    stderr: 'piped',
  });

  const result = await cmd.output();

  if (!result.success) {
    console.error('Failed to start Company HQ daemon');
    console.error(new TextDecoder().decode(result.stderr));
    Deno.exit(1);
  }

  console.log('Company HQ daemon started');
  console.log(`Session: ${COMPANY_SESSION}`);
  console.log(`Attach with: startup attach company`);
}

async function stopDaemon(dryRun?: boolean): Promise<void> {
  if (!(await isDaemonRunning())) {
    console.log('Company HQ daemon is not running');
    return;
  }

  if (dryRun) {
    console.log('[DRY RUN] Would kill tmux session:', COMPANY_SESSION);
    return;
  }

  console.log('Stopping Company HQ daemon...');

  const cmd = new Deno.Command('tmux', {
    args: ['kill-session', '-t', COMPANY_SESSION],
    stdout: 'null',
    stderr: 'piped',
  });

  const result = await cmd.output();

  if (!result.success) {
    console.error('Failed to stop Company HQ daemon');
    Deno.exit(1);
  }

  console.log('Company HQ daemon stopped');
}

async function showStatus(): Promise<void> {
  const running = await isDaemonRunning();

  console.log('Company HQ Daemon Status');
  console.log('=======================');
  console.log(`Status: ${running ? 'RUNNING' : 'STOPPED'}`);
  console.log(`Session: ${COMPANY_SESSION}`);

  if (running) {
    console.log('');
    console.log('Commands:');
    console.log('  startup company stop     Stop the daemon');
    console.log('  startup attach company   Attach to daemon session');
  } else {
    console.log('');
    console.log('Commands:');
    console.log('  startup company start    Start the daemon');
  }
}
