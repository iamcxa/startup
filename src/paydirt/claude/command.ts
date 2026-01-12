// src/paydirt/claude/command.ts
import type { ProspectRole } from '../../types.ts';

/**
 * Shell escape for single quotes.
 */
export function shellEscape(str: string): string {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

export interface EnvVarsOptions {
  role: ProspectRole;
  claimId: string;
  caravanName: string;
  tunnelPath?: string;
  mayorPaneIndex?: string;
  agentId?: string;
  paydirtBinPath?: string;
}

export function buildPaydirtEnvVars(options: EnvVarsOptions): Record<string, string> {
  const vars: Record<string, string> = {
    PAYDIRT_PROSPECT: options.role,
    PAYDIRT_CLAIM: options.claimId,
    PAYDIRT_CARAVAN: options.caravanName,
    PAYDIRT_SESSION: `paydirt-${options.claimId}`,
  };

  if (options.paydirtBinPath) {
    vars.PAYDIRT_BIN = options.paydirtBinPath;
  }
  if (options.tunnelPath) {
    vars.PAYDIRT_TUNNEL = options.tunnelPath;
  }
  if (options.mayorPaneIndex !== undefined) {
    vars.PAYDIRT_TRAIL_BOSS_PANE = options.mayorPaneIndex;
  }
  if (options.agentId) {
    vars.PAYDIRT_AGENT_ID = options.agentId;
  }

  // Pass Langfuse environment variables to spawned Claude processes
  if (Deno.env.get("LANGFUSE_ENABLED") === "true") {
    vars.LANGFUSE_ENABLED = "true";
    vars.LANGFUSE_SESSION_ID = Deno.env.get("LANGFUSE_SESSION_ID") || "";
    vars.LANGFUSE_SECRET_KEY = Deno.env.get("LANGFUSE_SECRET_KEY") || "";
    vars.LANGFUSE_PUBLIC_KEY = Deno.env.get("LANGFUSE_PUBLIC_KEY") || "";
    vars.LANGFUSE_BASE_URL = Deno.env.get("LANGFUSE_BASE_URL") || "";
  }

  return vars;
}

export interface ClaudeCommandOptions {
  role: ProspectRole;
  claimId: string;
  caravanName: string;
  paydirtInstallDir: string;
  userProjectDir: string;
  prompt: string;
  tunnelPath?: string;
  mayorPaneIndex?: string;
  agentId?: string;
  paydirtBinPath?: string;
  resume?: boolean;
  dangerouslySkipPermissions?: boolean;
  print?: boolean;  // Non-interactive mode (output and exit)
  model?: string;  // Model to use (e.g., 'sonnet', 'opus', 'haiku')
  extraArgs?: string[];
}

export function buildClaudeCommand(options: ClaudeCommandOptions): string {
  const {
    role,
    claimId,
    caravanName,
    paydirtInstallDir,
    userProjectDir,
    prompt,
    tunnelPath,
    mayorPaneIndex,
    agentId,
    paydirtBinPath,
    resume,
    dangerouslySkipPermissions,
    print,
    model,
    extraArgs = [],
  } = options;

  // Build environment variables
  const envVars = buildPaydirtEnvVars({
    role,
    claimId,
    caravanName,
    tunnelPath,
    mayorPaneIndex,
    agentId,
    paydirtBinPath: paydirtBinPath || `${paydirtInstallDir}/paydirt.ts`,
  });
  const envString = Object.entries(envVars)
    .map(([key, value]) => `${key}=${shellEscape(value)}`)
    .join(' ');

  // Build command arguments
  const args: string[] = ['claude'];

  // 1. Load paydirt as plugin (provides agents, commands, skills)
  args.push(`--plugin-dir ${shellEscape(paydirtInstallDir)}`);

  // 2. Add paydirt install directory (for agent to read paydirt code)
  args.push(`--add-dir ${shellEscape(paydirtInstallDir)}`);

  // 3. Add user's project directory (main working directory)
  args.push(`--add-dir ${shellEscape(userProjectDir)}`);

  // 4. Specify agent file
  args.push(`--agent ${shellEscape(`${paydirtInstallDir}/prospects/${role}.md`)}`);

  // 5. Resume flag
  if (resume) {
    args.push('--resume');
  }

  // 6. Skip permissions flag (for autonomous operation)
  if (dangerouslySkipPermissions) {
    args.push('--dangerously-skip-permissions');
    args.push('--permission-mode', 'bypassPermissions');
  }

  // 7. Print flag (for non-interactive mode - run and exit)
  if (print) {
    args.push('--print');
  }

  // 8. Model specification (e.g., 'sonnet', 'opus', 'haiku')
  if (model) {
    args.push('--model', model);
  }

  // 9. Extra args
  args.push(...extraArgs);

  // Build full command with env vars and cd to project dir
  // When using --print mode, pipe the prompt via stdin for more reliable execution
  // (positional prompt argument has inconsistent behavior with --print)
  let command: string;
  if (print && prompt) {
    // Use subshell to ensure proper piping: cd && (echo | command)
    command = `cd ${shellEscape(userProjectDir)} && echo ${shellEscape(prompt)} | ${envString} ${args.join(' ')}`;
  } else {
    // 10. Prompt as last argument (for interactive mode)
    if (prompt) {
      args.push(shellEscape(prompt));
    }
    command = `cd ${shellEscape(userProjectDir)} && ${envString} ${args.join(' ')}`;
  }

  return command;
}
