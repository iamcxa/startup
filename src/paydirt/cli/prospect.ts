// src/paydirt/cli/prospect.ts
import type { ProspectRole } from '../../types.ts';
import { getPaydirtBinPath, getPaydirtInstallDir, getUserProjectDir } from '../paths.ts';
import { buildClaudeCommand } from '../claude/command.ts';
import { startActiveObservation } from 'npm:@langfuse/tracing@^4.5.1';

export interface ProspectOptions {
  role: string;
  task?: string;
  claimId?: string;
  dryRun?: boolean;
  background?: boolean;
  model?: string;  // Model to use (e.g., 'sonnet', 'opus', 'haiku')
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
  'pm',  // Decision proxy agent
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

/**
 * Execute the prospect spawning logic.
 * Returns exit code: 0 for success, 1 for failure.
 */
async function executeProspect(options: ProspectOptions): Promise<number> {
  const { role, task, claimId, dryRun, background, model } = options;

  // Validate role
  if (!VALID_ROLES.includes(role as ProspectRole)) {
    console.error(`Error: Invalid prospect role: ${role}`);
    console.error(`Valid roles: ${VALID_ROLES.join(', ')}`);
    return 1;
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

  // PM is a one-shot agent (read, answer, close, exit) - uses --print mode
  // Other agents like Miner need interactive mode for continuous work
  const isOneShotAgent = prospectRole === 'pm';

  const claudeCommand = buildClaudeCommand({
    role: prospectRole,
    claimId: resolvedClaimId,
    caravanName,
    paydirtInstallDir,
    userProjectDir,
    prompt,
    paydirtBinPath: getPaydirtBinPath(),
    dangerouslySkipPermissions: true,  // Enable autonomous operation
    print: background && isOneShotAgent,  // Only one-shot agents use --print
    model,  // Model to use (e.g., 'sonnet', 'opus', 'haiku')
  });

  if (dryRun) {
    console.log('\n[DRY RUN] Would execute:');
    console.log(claudeCommand);
    return 0;
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
    return 1;
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

  return 0;
}

export async function prospectCommand(options: ProspectOptions): Promise<void> {
  const { role, task, claimId } = options;

  // If Langfuse is not enabled, execute directly
  if (Deno.env.get('LANGFUSE_ENABLED') !== 'true') {
    const exitCode = await executeProspect(options);
    if (exitCode !== 0) {
      Deno.exit(exitCode);
    }
    return;
  }

  // Wrap execution with Langfuse observation
  await startActiveObservation(
    `prospect-${role}`,
    async (span) => {
      // Set span attributes (TypeScript definitions may be incomplete, but runtime supports these)
      span.update({
        input: { role, claim: claimId, task },
        sessionId: Deno.env.get('LANGFUSE_SESSION_ID'),
        metadata: { claimId },
        tags: ['prospect', role],
      } as any);

      const exitCode = await executeProspect(options);

      span.update({
        output: { exitCode },
        level: exitCode === 0 ? 'DEFAULT' : 'ERROR',
      });

      if (exitCode !== 0) {
        Deno.exit(exitCode);
      }
    }
  );
}
