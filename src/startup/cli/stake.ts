// src/startup/cli/stake.ts

/**
 * Stake command - Create a new Team with Zellij session.
 * Uses pure Zellij sessions (no tmux).
 */

import { getStartupBinPath, getStartupInstallDir, getUserProjectDir } from '../paths.ts';
import { buildClaudeCommand } from '../claude/command.ts';
import {
  addTabToSession,
  attachSession,
  COMPANY_SESSION,
  createBackgroundSession,
  deleteSession,
  escapeKdlString,
  getSessionState,
  getTempLayoutPath,
  sessionIsAlive,
  writeLayoutFile,
} from '../boomtown/zellij-session.ts';

export interface StakeOptions {
  task: string;
  primeMode?: boolean;
  tunnelPath?: string;
  dryRun?: boolean;
}

/**
 * Notify Boomtown dashboard of a new team.
 * Writes to a notification file that the Control Room status script checks.
 */
async function notifyNewTeam(claimId: string, task: string): Promise<void> {
  const notification = `${claimId}: ${task.substring(0, 50)}`;
  const file = '/tmp/startup-new-teams';

  try {
    await Deno.writeTextFile(file, notification + '\n', { append: true });
  } catch {
    // Ignore write errors
  }
}

/**
 * Create a team issue in beads (bd).
 * Returns the issue ID if successful, null otherwise.
 */
async function createTeamIssue(task: string): Promise<string | null> {
  const title = task.length > 60 ? task.slice(0, 57) + '...' : task;

  const cmd = new Deno.Command('bd', {
    args: [
      'create',
      '--title',
      title,
      '--type',
      'task',
      '--label',
      'st:team',
      '--description',
      `Team task: ${task}`,
    ],
    stdout: 'piped',
    stderr: 'piped',
  });

  const result = await cmd.output();
  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr);
    console.error('Failed to create team issue:', stderr);
    return null;
  }

  // Parse the output to get the issue ID
  // Output format: "Created issue: pd-xxx"
  const output = new TextDecoder().decode(result.stdout).trim();
  const match = output.match(/Created issue:\s*(\S+)/);
  return match ? match[1] : null;
}

/**
 * Generate the Team layout with Claude running directly.
 */
function generateTeamLayout(tabName: string, claudeCommand: string, roleName: string): string {
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

    tab name="${escapeKdlString(tabName)}" focus=true {
        pane name="${escapeKdlString(roleName)}" {
            command "bash"
            args "-c" "${escapeKdlString(claudeCommand)}"
        }
    }
}
`;
}

export async function stakeCommand(options: StakeOptions): Promise<void> {
  const { task, primeMode: _primeMode, tunnelPath, dryRun } = options;

  console.log(`Staking claim for: "${task}"`);

  if (dryRun) {
    const mockId = `pd-${Date.now().toString(36)}`;
    const teamName = task.slice(0, 30).replace(/\s+/g, '-').toLowerCase();
    const sessionName = `startup-${mockId}`;
    const startupInstallDir = getStartupInstallDir();
    const userProjectDir = getUserProjectDir();
    const command = buildClaudeCommand({
      role: 'trail-boss',
      claimId: mockId,
      caravanName: teamName,
      startupInstallDir,
      userProjectDir,
      prompt: `You are the Trail Boss coordinating this Team. The task is: "${task}".`,
      tunnelPath,
      startupBinPath: getStartupBinPath(),
    });
    console.log('\n[DRY RUN] Would execute:');
    console.log(command);
    console.log(`\nSession name: ${sessionName}`);
    return;
  }

  // Create team issue in beads
  console.log('Creating team issue...');
  const claimId = await createTeamIssue(task);
  if (!claimId) {
    console.error('✗ Failed to create team issue in beads');
    Deno.exit(1);
  }
  console.log(`✓ Created team: ${claimId}`);

  const teamName = task.slice(0, 30).replace(/\s+/g, '-').toLowerCase();
  const sessionName = `startup-${claimId}`;

  // Build Claude command
  const startupInstallDir = getStartupInstallDir();
  const userProjectDir = getUserProjectDir();

  const command = buildClaudeCommand({
    role: 'trail-boss',
    claimId,
    caravanName: teamName,
    startupInstallDir,
    userProjectDir,
    prompt: `You are the Trail Boss coordinating this Team. The task is: "${task}".`,
    tunnelPath,
    startupBinPath: getStartupBinPath(),
  });

  // Check session state
  const state = await getSessionState(sessionName);

  if (state === 'alive') {
    console.log(`\n⚠ Session "${sessionName}" already exists`);
    console.log('Attaching to existing session...');
    await attachSession(sessionName);
    return;
  }

  // Clean up dead session if exists
  if (state === 'dead') {
    console.log('Cleaning up dead session...');
    await deleteSession(sessionName);
  }

  // Create Zellij session and launch Claude directly
  console.log(`\n⛏ Creating Team session: ${sessionName}`);

  // Generate layout with Claude running directly
  const layout = generateTeamLayout(teamName, command, 'lead');
  const layoutPath = getTempLayoutPath(claimId);
  await writeLayoutFile(layoutPath, layout);

  // Create background session
  const success = await createBackgroundSession(sessionName, {
    layoutPath,
    cwd: userProjectDir,
  });

  if (!success) {
    console.error('✗ Failed to create Zellij session');
    Deno.exit(1);
  }

  // Notify Boomtown dashboard
  await notifyNewTeam(claimId, task);

  // Add team tab to Company HQ if running
  if (await sessionIsAlive(COMPANY_SESSION)) {
    const added = await addTabToSession(COMPANY_SESSION, teamName);
    if (added) {
      console.log(`✓ Added tab to Company HQ`);
    }
  }

  console.log(`✓ Team started: ${claimId}`);
  console.log(`\n▶ Attaching to session...`);
  console.log(`  (Press Ctrl+o d to detach)`);
  console.log(`  (Press Ctrl+s to scroll)`);

  // Attach to the session
  await attachSession(sessionName);
}
