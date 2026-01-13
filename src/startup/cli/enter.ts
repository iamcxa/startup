// src/startup/cli/enter.ts
/**
 * Enter command - Launch the Startup office (Zellij session with CTO).
 *
 * This command:
 * 1. Creates/attaches to CTO Zellij session with Claude running directly
 * 2. Claude runs in a native Zellij pane (no tmux intermediary)
 * 3. Enables native scrolling with Ctrl+s
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
  writeLayoutFile,
} from '../boomtown/zellij-session.ts';

export interface EnterOptions {
  dryRun?: boolean;
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

/**
 * Ensure CTO Zellij session exists with Claude running.
 */
async function ensureCtoSession(): Promise<'created' | 'existed' | 'resurrected' | 'failed'> {
  const state = await getSessionState(COMPANY_SESSION);

  switch (state) {
    case 'alive':
      console.log(`✓ CTO session already running`);
      return 'existed';

    case 'dead':
      console.log(`CTO session is dead, recreating...`);
      await deleteSession(COMPANY_SESSION);
      // Fall through to create
      // falls through

    case 'none': {
      console.log(`Creating CTO session...`);

      // Build Claude command and layout
      const claudeCmd = buildCtoClaudeCommand();
      const layout = generateCtoLayout(claudeCmd);
      const layoutPath = getTempLayoutPath('company');

      // Write layout file
      await writeLayoutFile(layoutPath, layout);

      // Create background session
      const success = await createBackgroundSession(COMPANY_SESSION, {
        layoutPath,
        cwd: getUserProjectDir(),
      });

      if (success) {
        console.log(`✓ CTO session created`);
        return state === 'dead' ? 'resurrected' : 'created';
      } else {
        return 'failed';
      }
    }
  }
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
    console.log('1. Create/attach to CTO Zellij session');
    console.log('2. Claude runs directly in Zellij pane (native scrolling)');
    return;
  }

  // Step 1: Ensure CTO session exists with Claude running
  const result = await ensureCtoSession();
  if (result === 'failed') {
    console.error('✗ Failed to start CTO session');
    Deno.exit(1);
  }

  // Step 2: Attach to the Zellij session
  console.log(`\nAttaching to CTO session...`);
  console.log(`  (Press Ctrl+o d to detach)`);
  console.log(`  (Press Ctrl+s to scroll)\n`);

  await attachSession(COMPANY_SESSION);
}
