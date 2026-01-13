// src/startup/cli/enter.ts
/**
 * Enter command - Launch the Startup office (Zellij dashboard with CTO).
 *
 * This command:
 * 1. Ensures CTO tmux session exists with CTO Claude running
 * 2. Launches Zellij dashboard attached to the CTO session
 * 3. Allows CTO to create teams via kickoff
 */

import { getStartupBinPath, getStartupInstallDir, getUserProjectDir } from '../paths.ts';
import { buildClaudeCommand } from '../claude/command.ts';
import { CTO_TMUX_SESSION, launchZellijBoomtown } from '../boomtown/mod.ts';

export interface EnterOptions {
  dryRun?: boolean;
}

/**
 * Check if a tmux session exists.
 */
async function tmuxSessionExists(sessionName: string): Promise<boolean> {
  const cmd = new Deno.Command('tmux', {
    args: ['has-session', '-t', sessionName],
    stdout: 'null',
    stderr: 'null',
  });
  const result = await cmd.output();
  return result.success;
}

/**
 * Check if a tmux window exists in a session.
 */
async function tmuxWindowExists(sessionName: string, windowName: string): Promise<boolean> {
  const cmd = new Deno.Command('tmux', {
    args: ['list-windows', '-t', sessionName, '-F', '#{window_name}'],
    stdout: 'piped',
    stderr: 'null',
  });
  const result = await cmd.output();
  if (!result.success) return false;

  const windows = new TextDecoder().decode(result.stdout).trim().split('\n');
  return windows.includes(windowName);
}

/**
 * Create CTO tmux session with Claude running.
 */
async function ensureCtoSession(): Promise<boolean> {
  const sessionName = CTO_TMUX_SESSION;
  const windowName = 'cto';

  // Check if session exists
  if (await tmuxSessionExists(sessionName)) {
    // Check if CTO window exists
    if (await tmuxWindowExists(sessionName, windowName)) {
      console.log(`✓ CTO session already running`);
      return true;
    }

    // Session exists but no CTO window - create it
    console.log(`Creating CTO window in existing session...`);
    const claudeCmd = buildCtoClaudeCommand();
    const cmd = new Deno.Command('tmux', {
      args: [
        'new-window',
        '-t', sessionName,
        '-n', windowName,
        '-c', getUserProjectDir(),
        claudeCmd,
      ],
      stdout: 'piped',
      stderr: 'piped',
    });
    const result = await cmd.output();
    return result.success;
  }

  // Create new session with CTO window
  console.log(`Creating CTO session...`);
  const claudeCmd = buildCtoClaudeCommand();
  const cmd = new Deno.Command('tmux', {
    args: [
      'new-session',
      '-d',
      '-s', sessionName,
      '-n', windowName,
      '-c', getUserProjectDir(),
      claudeCmd,
    ],
    stdout: 'piped',
    stderr: 'piped',
  });

  const result = await cmd.output();
  if (result.success) {
    console.log(`✓ CTO session created`);
  }
  return result.success;
}

/**
 * Build the Claude command for CTO.
 */
function buildCtoClaudeCommand(): string {
  const startupInstallDir = getStartupInstallDir();
  const userProjectDir = getUserProjectDir();

  return buildClaudeCommand({
    role: 'camp-boss',
    claimId: 'company',
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
 * Enter the Startup office.
 */
export async function enterCommand(options: EnterOptions): Promise<void> {
  console.log(`
╭────────────────────────────────────────────────────────────────╮
│                                                                │
│   ╭─────────────────╮                                          │
│   │  ★         ★    │    STARTUP OFFICE                        │
│   │      ◆◆◆       │                                          │
│   │    ◆     ◆     │    "Welcome to the office."              │
│   │  ╰─────────╯    │                                          │
│   ╰────────┬────────╯                                          │
│            │                                                   │
│                                                                │
╰────────────────────────────────────────────────────────────────╯
`);

  if (options.dryRun) {
    console.log('[DRY RUN] Would:');
    console.log('1. Ensure CTO tmux session exists');
    console.log('2. Launch Zellij dashboard');
    return;
  }

  // Step 1: Ensure CTO session exists with Claude running
  const ctoReady = await ensureCtoSession();
  if (!ctoReady) {
    console.error('✗ Failed to start CTO session');
    Deno.exit(1);
  }

  // Step 2: Launch Zellij dashboard
  console.log(`\nOpening Zellij dashboard...`);
  console.log(`  (CTO tab will attach to CTO session)`);
  console.log(`  (Press Ctrl+o d to detach)\n`);

  await launchZellijBoomtown();
}
