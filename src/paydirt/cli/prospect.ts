// src/paydirt/cli/prospect.ts
import type { ProspectRole } from '../../types.ts';
import { getPaydirtBinPath, getPaydirtInstallDir, getUserProjectDir } from '../paths.ts';
import { buildClaudeCommand } from '../claude/command.ts';

export interface ProspectOptions {
  role: string;
  task?: string;
  claimId?: string;
  dryRun?: boolean;
  background?: boolean;
}

const VALID_ROLES: ProspectRole[] = [
  'camp-boss',
  'trail-boss',
  'surveyor',
  'shift-boss',
  'miner',
  'assayer',
  'canary',
  'smelter',
  'claim-agent',
  'scout',
];

/**
 * Check if a tmux session exists.
 */
async function sessionExists(sessionName: string): Promise<boolean> {
  const cmd = new Deno.Command('tmux', {
    args: ['has-session', '-t', sessionName],
    stdout: 'null',
    stderr: 'null',
  });
  const result = await cmd.output();
  return result.success;
}

/**
 * Create a new tmux window in existing session.
 */
async function createTmuxWindow(
  sessionName: string,
  windowName: string,
  command: string,
  projectDir: string,
): Promise<boolean> {
  const cmd = new Deno.Command('tmux', {
    args: [
      'new-window',
      '-t', sessionName,
      '-n', windowName,
      '-c', projectDir,
      command,
    ],
    stdout: 'piped',
    stderr: 'piped',
  });

  const result = await cmd.output();
  return result.success;
}

/**
 * Create a new tmux session with a window.
 */
async function createTmuxSession(
  sessionName: string,
  windowName: string,
  command: string,
  projectDir: string,
): Promise<boolean> {
  const cmd = new Deno.Command('tmux', {
    args: [
      'new-session',
      '-d',
      '-s', sessionName,
      '-n', windowName,
      '-c', projectDir,
      command,
    ],
    stdout: 'piped',
    stderr: 'piped',
  });

  const result = await cmd.output();
  return result.success;
}

export async function prospectCommand(options: ProspectOptions): Promise<void> {
  const { role, task, claimId, dryRun, background } = options;

  // Validate role
  if (!VALID_ROLES.includes(role as ProspectRole)) {
    console.error(`Error: Invalid prospect role: ${role}`);
    console.error(`Valid roles: ${VALID_ROLES.join(', ')}`);
    Deno.exit(1);
  }

  const prospectRole = role as ProspectRole;

  // Generate claimId if not provided
  const resolvedClaimId = claimId || `pd-${Date.now().toString(36)}`;
  const caravanName = task
    ? task.slice(0, 30).replace(/\s+/g, '-').toLowerCase()
    : `standalone-${prospectRole}`;

  console.log(`Spawning Prospect: ${prospectRole}`);
  if (claimId) {
    console.log(`Caravan: ${claimId}`);
  }

  // Build Claude command
  const paydirtInstallDir = getPaydirtInstallDir();
  const userProjectDir = getUserProjectDir();

  const prompt = task
    ? `You are a ${prospectRole} prospect. Your task is: "${task}".`
    : `You are a ${prospectRole} prospect. Awaiting instructions.`;

  const claudeCommand = buildClaudeCommand({
    role: prospectRole,
    claimId: resolvedClaimId,
    caravanName,
    paydirtInstallDir,
    userProjectDir,
    prompt,
    paydirtBinPath: getPaydirtBinPath(),
  });

  if (dryRun) {
    console.log('\n[DRY RUN] Would execute:');
    console.log(claudeCommand);
    return;
  }

  // Determine session name - use existing Caravan session if claimId provided
  const sessionName = claimId ? `paydirt-${claimId}` : `paydirt-${resolvedClaimId}`;
  const windowName = prospectRole;

  // Check if session exists
  const hasSession = await sessionExists(sessionName);

  let success: boolean;
  if (hasSession) {
    // Add window to existing session
    console.log(`Adding ${prospectRole} to existing session: ${sessionName}`);
    success = await createTmuxWindow(sessionName, windowName, claudeCommand, userProjectDir);
  } else {
    // Create new session
    console.log(`Creating new session: ${sessionName}`);
    success = await createTmuxSession(sessionName, windowName, claudeCommand, userProjectDir);
  }

  if (!success) {
    console.error(`Failed to spawn ${prospectRole}`);
    Deno.exit(1);
  }

  console.log(`Prospect ${prospectRole} spawned in ${sessionName}`);

  // If not background mode, attach to the session
  if (!background) {
    console.log(`Attaching to session...`);
    const attachCmd = new Deno.Command('tmux', {
      args: ['attach-session', '-t', sessionName],
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    });
    await attachCmd.output();
  }
}
