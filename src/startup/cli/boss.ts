// src/startup/cli/boss.ts

/**
 * Company HQ daemon management commands.
 * Uses pure Zellij sessions (no tmux).
 */

import { getStartupBinPath, getStartupInstallDir, getUserProjectDir } from '../paths.ts';
import { buildClaudeCommand } from '../claude/command.ts';
import {
  attachSession,
  COMPANY_SESSION,
  createBackgroundSession,
  deleteSession,
  escapeKdlString,
  getSessionState,
  getTempLayoutPath,
  killSession,
  sessionIsAlive,
  writeLayoutFile,
} from '../boomtown/zellij-session.ts';

const COMPANY_LOG_LABEL = 'st:company';
const COMPANY_LOG_TITLE = 'Company HQ Command Log';

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
      '--title',
      COMPANY_LOG_TITLE,
      '--type',
      'epic',
      '--label',
      COMPANY_LOG_LABEL,
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

/**
 * Build the Claude command for CTO.
 */
function buildCtoClaudeCommand(claimId?: string): string {
  const startupInstallDir = getStartupInstallDir();
  const userProjectDir = getUserProjectDir();

  return buildClaudeCommand({
    role: 'camp-boss',
    claimId: claimId || 'company',
    caravanName: 'startup-company',
    startupInstallDir,
    userProjectDir,
    prompt: 'You are the CTO. Greet the human and await instructions.',
    startupBinPath: getStartupBinPath(),
    dangerouslySkipPermissions: true,
    agentPath: `${userProjectDir}/.startup/agents/cto.md`,
  });
}

/**
 * Generate the CTO layout with Claude running directly.
 */
function generateCtoLayout(claudeCommand: string): string {
  return `layout {
    default_tab_template {
        pane size=1 borderless=true {
            plugin location="zellij:tab-bar"
        }
        children
        pane size=2 borderless=true {
            plugin location="zellij:status-bar"
        }
    }

    tab name="CTO" focus=true {
        pane name="CTO" {
            command "bash"
            args "-c" "${escapeKdlString(claudeCommand)}"
        }
    }
}
`;
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
  const state = await getSessionState(COMPANY_SESSION);

  if (state === 'alive') {
    console.log('Company HQ daemon is already running');
    console.log(`Attach with: startup attach company`);
    return;
  }

  // Ensure company log exists
  const companyLogId = await ensureCompanyLog();
  if (companyLogId) {
    console.log(`Company log: ${companyLogId}`);
  }

  if (dryRun) {
    console.log('[DRY RUN] Would create Zellij session:');
    console.log(`  Session: ${COMPANY_SESSION}`);
    console.log(`  CTO Claude running directly in pane`);
    return;
  }

  // Clean up dead session if exists
  if (state === 'dead') {
    console.log('Cleaning up dead session...');
    await deleteSession(COMPANY_SESSION);
  }

  console.log('Starting Company HQ daemon...');

  // Build Claude command and layout
  const claudeCmd = buildCtoClaudeCommand(companyLogId || undefined);
  const layout = generateCtoLayout(claudeCmd);
  const layoutPath = getTempLayoutPath('company');

  // Write layout file
  await writeLayoutFile(layoutPath, layout);

  // Create background session
  const success = await createBackgroundSession(COMPANY_SESSION, {
    layoutPath,
    cwd: getUserProjectDir(),
  });

  if (!success) {
    console.error('Failed to start Company HQ daemon');
    Deno.exit(1);
  }

  console.log('Company HQ daemon started');
  console.log(`Session: ${COMPANY_SESSION}`);
  console.log(`Attach with: startup attach company`);
}

async function stopDaemon(dryRun?: boolean): Promise<void> {
  if (!(await sessionIsAlive(COMPANY_SESSION))) {
    console.log('Company HQ daemon is not running');
    return;
  }

  if (dryRun) {
    console.log('[DRY RUN] Would kill Zellij session:', COMPANY_SESSION);
    return;
  }

  console.log('Stopping Company HQ daemon...');

  const success = await killSession(COMPANY_SESSION);

  if (!success) {
    console.error('Failed to stop Company HQ daemon');
    Deno.exit(1);
  }

  console.log('Company HQ daemon stopped');
}

async function showStatus(): Promise<void> {
  const state = await getSessionState(COMPANY_SESSION);
  const running = state === 'alive';

  console.log('Company HQ Daemon Status');
  console.log('=======================');
  console.log(`Status: ${running ? 'RUNNING' : state === 'dead' ? 'DEAD' : 'STOPPED'}`);
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
