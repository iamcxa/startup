#!/usr/bin/env -S deno run --allow-all
/**
 * Startup - Multi-agent orchestrator
 *
 * Usage:
 *   startup call <role> "task"
 *   st call <role> "task"
 *
 * Roles:
 *   cto        - Technical decisions, architecture (was: camp-boss)
 *   engineer   - Implementation via TDD (was: miner)
 *   designer   - Design planning (was: planner)
 *   lead       - Task breakdown (was: foreman)
 *   qa         - E2E verification (was: witness)
 *   reviewer   - Code review (was: assayer)
 *   product    - Product Q&A (was: pm)
 */

import { parseArgs } from '@std/cli/parse-args';
import { load } from '@std/dotenv';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';

const VERSION = '0.1.0';

// Role mapping: startup role -> internal role
const ROLE_MAP: Record<string, string> = {
  'cto': 'camp-boss',
  'engineer': 'miner',
  'designer': 'planner',
  'lead': 'foreman',
  'qa': 'witness',
  'reviewer': 'assayer',
  'product': 'pm',
};

const STARTUP_ROLES = Object.keys(ROLE_MAP);

let sdk: NodeSDK | null = null;

async function initLangfuse() {
  await load({ export: true });
  if (Deno.env.get("LANGFUSE_ENABLED") !== "true") return;

  const spanProcessor = new LangfuseSpanProcessor();
  sdk = new NodeSDK({ spanProcessors: [spanProcessor] });
  sdk.start();

  const cleanup = async () => {
    if (sdk) {
      await spanProcessor.forceFlush();
      await sdk.shutdown();
    }
  };

  Deno.addSignalListener("SIGINT", cleanup);
  Deno.addSignalListener("SIGTERM", cleanup);
  globalThis.addEventListener("unload", cleanup);
}

function printHelp(): void {
  console.log(`
Startup v${VERSION} - Multi-agent orchestrator

Usage:
  startup call <role> "task"       Start an agent
  startup kickoff "task"           Create a team and start collaboration
  startup company start|stop|status Manage company daemon
  startup list                     List all teams
  startup attach [team]            Attach to a team session

Roles:
  cto        Technical decisions, architecture design
  engineer   Feature implementation (TDD)
  designer   Design planning (brainstorming)
  lead       Task breakdown
  qa         E2E verification (Chrome MCP)
  reviewer   Code review
  product    Product Q&A

Options:
  -h, --help        Show this help
  -v, --version     Show version
  --dry-run         Preview without executing
  -b, --background  Run in background
  -m, --model       Model to use (sonnet, opus, haiku)

Examples:
  startup call cto "Design authentication architecture"
  st call engineer "Implement login feature"
  st call qa "Verify login flow"
  startup kickoff "Build user authentication"
  startup company start
`);
}

async function callCommand(role: string, task: string, options: {
  dryRun?: boolean;
  background?: boolean;
  model?: string;
  claimId?: string;
}): Promise<void> {
  // Map startup role to internal role
  const internalRole = ROLE_MAP[role];
  if (!internalRole) {
    console.error(`Error: Unknown role '${role}'`);
    console.error(`Valid roles: ${STARTUP_ROLES.join(', ')}`);
    Deno.exit(1);
  }

  // Import and call the existing prospect command
  const { prospectCommand } = await import('./src/startup/cli/mod.ts');
  await prospectCommand({
    role: internalRole,
    task,
    claimId: options.claimId,
    dryRun: options.dryRun,
    background: options.background,
    model: options.model,
  });
}

async function main(): Promise<void> {
  const args = parseArgs(Deno.args, {
    boolean: ['help', 'version', 'dry-run', 'background'],
    string: ['model', 'claim'],
    alias: {
      h: 'help',
      v: 'version',
      b: 'background',
      m: 'model',
    },
  });

  if (args.help) {
    printHelp();
    Deno.exit(0);
  }

  if (args.version) {
    console.log(`Startup v${VERSION}`);
    Deno.exit(0);
  }

  const command = args._[0] as string | undefined;

  if (!command) {
    printHelp();
    Deno.exit(1);
  }

  switch (command) {
    case 'call': {
      const role = args._[1] as string;
      const task = args._[2] as string;

      if (!role) {
        console.error('Error: Role required');
        console.error('Usage: startup call <role> "task"');
        Deno.exit(1);
      }

      if (!task) {
        console.error('Error: Task description required');
        console.error('Usage: startup call <role> "task"');
        Deno.exit(1);
      }

      await callCommand(role, task, {
        dryRun: args['dry-run'],
        background: args.background,
        model: args.model as string,
        claimId: args.claim as string,
      });
      break;
    }
    case 'kickoff': {
      const task = args._[1] as string;
      if (!task) {
        console.error('Error: Task description required');
        console.error('Usage: startup kickoff "task"');
        Deno.exit(1);
      }
      const { stakeCommand } = await import('./src/startup/cli/mod.ts');
      await stakeCommand({ task, dryRun: args['dry-run'] });
      break;
    }
    case 'company': {
      const subcommand = args._[1] as string;
      if (!subcommand || !['start', 'stop', 'status'].includes(subcommand)) {
        console.error('Error: Subcommand required (start|stop|status)');
        console.error('Usage: startup company start|stop|status');
        Deno.exit(1);
      }
      const { bossCommand } = await import('./src/startup/cli/mod.ts');
      await bossCommand({ subcommand: subcommand as 'start' | 'stop' | 'status', dryRun: args['dry-run'] });
      break;
    }
    case 'list': {
      const { listCommand } = await import('./src/startup/cli/mod.ts');
      await listCommand();
      break;
    }
    case 'attach': {
      const { attachCommand } = await import('./src/startup/cli/mod.ts');
      await attachCommand({ target: args._[1] as string });
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      Deno.exit(1);
  }
}

if (import.meta.main) {
  await initLangfuse();
  await main();
}
