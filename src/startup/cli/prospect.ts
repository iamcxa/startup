// src/startup/cli/prospect.ts
import type { ProspectRole } from '../../types.ts';
import { getStartupBinPath, getStartupInstallDir, getUserProjectDir } from '../paths.ts';
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

// Startup role aliases -> internal role mapping
const STARTUP_ROLE_MAP: Record<string, ProspectRole> = {
  'cto': 'camp-boss',
  'engineer': 'miner',
  'designer': 'surveyor',  // Note: 'planner' doesn't exist, use 'surveyor'
  'lead': 'shift-boss',    // Note: 'foreman' doesn't exist, use 'shift-boss'
  'qa': 'canary',          // Note: 'witness' doesn't exist, use 'canary'
  'reviewer': 'assayer',
  'product': 'pm',
};

/**
 * Resolve a role string to a valid ProspectRole.
 * Accepts both internal roles and startup role aliases.
 */
function resolveRole(role: string): ProspectRole | null {
  // Check if it's an internal role
  if (VALID_ROLES.includes(role as ProspectRole)) {
    return role as ProspectRole;
  }
  // Check if it's a startup role alias
  if (role in STARTUP_ROLE_MAP) {
    return STARTUP_ROLE_MAP[role];
  }
  return null;
}

/**
 * Get startup role name from internal role (for .startup/agents/ lookup).
 * Returns null if the internal role has no startup alias.
 */
function getStartupRoleName(internalRole: ProspectRole): string | null {
  for (const [startupRole, internal] of Object.entries(STARTUP_ROLE_MAP)) {
    if (internal === internalRole) return startupRole;
  }
  return null;
}

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

  // Validate and resolve role (supports both internal roles and startup aliases)
  const prospectRole = resolveRole(role);
  if (!prospectRole) {
    console.error(`Error: Invalid prospect role: ${role}`);
    console.error(`Valid roles: ${[...VALID_ROLES, ...Object.keys(STARTUP_ROLE_MAP)].join(', ')}`);
    return 1;
  }

  // Track original role for agent path resolution
  const originalRole = role;

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
  const startupInstallDir = getStartupInstallDir();
  const userProjectDir = getUserProjectDir();

  const prompt = task
    ? `You are a ${prospectRole} prospect. Your task is: "${task}".`
    : `You are a ${prospectRole} prospect. Awaiting instructions.`;

  // PM is a one-shot agent (read, answer, close, exit) - uses --print mode
  // Other agents like Miner need interactive mode for continuous work
  const isOneShotAgent = prospectRole === 'pm';

  // Determine agent file path - use .startup/agents/ for startup role aliases
  let agentPath: string | undefined;
  // Only use startup agent path if the original role was a startup alias
  if (originalRole in STARTUP_ROLE_MAP) {
    // Check if .startup/agents/{startupRole}.md exists
    const startupAgentPath = `${userProjectDir}/.startup/agents/${originalRole}.md`;
    try {
      await Deno.stat(startupAgentPath);
      agentPath = startupAgentPath;
    } catch {
      // Fall back to default prospects/ path
    }
  }

  const claudeCommand = buildClaudeCommand({
    role: prospectRole,
    claimId: resolvedClaimId,
    caravanName,
    startupInstallDir,
    userProjectDir,
    prompt,
    startupBinPath: getStartupBinPath(),
    dangerouslySkipPermissions: true,  // Enable autonomous operation
    print: background && isOneShotAgent,  // Only one-shot agents use --print
    model,  // Model to use (e.g., 'sonnet', 'opus', 'haiku')
    agentPath,  // Use startup agent if available
  });

  if (dryRun) {
    console.log('\n[DRY RUN] Would execute:');
    console.log(claudeCommand);
    return 0;
  }

  // Determine session name - use existing Caravan session if claimId provided
  const sessionName = claimId ? `startup-${claimId}` : `startup-${resolvedClaimId}`;
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
