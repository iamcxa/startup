#!/usr/bin/env -S deno run --allow-all
/**
 * Paydirt - Multi-agent orchestrator with Goldflow execution engine
 *
 * Usage:
 *   paydirt <command> [options]
 *   pd <command> [options]
 *
 * Commands:
 *   stake "task"     Start new Caravan
 *   continue [id]    Resume existing Caravan
 *   survey [id]      Show status
 *   abandon [id]     Stop Caravan
 *   prospect <role>  Spawn specific Prospect
 *   boomtown         Open Dashboard
 *   ledger           View history
 */

import { parseArgs } from '@std/cli/parse-args';
import { load } from '@std/dotenv';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import {
  abandonCommand,
  attachCommand,
  bossCommand,
  continueCommand,
  listCommand,
  prospectCommand,
  stakeCommand,
  surveyCommand,
} from './src/paydirt/cli/mod.ts';
import { launchZellijBoomtown } from './src/paydirt/boomtown/zellij-dashboard.ts';

const VERSION = '0.1.0';

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
Paydirt v${VERSION} - Multi-agent orchestrator

Usage:
  paydirt <command> [options]
  pd <command> [options]

Commands:
  stake "task"      Start new Caravan (stake a claim)
  continue [id]     Resume existing Caravan
  survey [id]       Show status
  abandon [id]      Stop Caravan
  prospect <role>   Spawn specific Prospect
  boomtown          Open Dashboard
  attach [target]   Attach to tmux session (use 'boss' for daemon)
  list              List all Paydirt tmux sessions
  boss <cmd>        Manage Camp Boss daemon (start|stop|status)
  ledger            View history

Options:
  -h, --help        Show this help
  -v, --version     Show version
  --dry-run         Preview without executing
`);
}

async function main(): Promise<void> {
  const args = parseArgs(Deno.args, {
    boolean: ['help', 'version', 'dry-run', 'force', 'background'],
    string: ['task', 'claim', 'model'],
    alias: {
      h: 'help',
      v: 'version',
      f: 'force',
      b: 'background',
      m: 'model',
    },
  });

  if (args.help) {
    printHelp();
    Deno.exit(0);
  }

  if (args.version) {
    console.log(`Paydirt v${VERSION}`);
    Deno.exit(0);
  }

  const command = args._[0] as string | undefined;

  if (!command) {
    printHelp();
    Deno.exit(1);
  }

  switch (command) {
    case 'stake': {
      const task = args._[1] as string;
      if (!task) {
        console.error('Error: Task description required');
        console.error('Usage: paydirt stake "task description"');
        Deno.exit(1);
      }
      await stakeCommand({
        task,
        dryRun: args['dry-run'],
      });
      break;
    }
    case 'survey':
      surveyCommand({ claimId: args._[1] as string });
      break;
    case 'continue':
      continueCommand({ claimId: args._[1] as string });
      break;
    case 'abandon':
      abandonCommand({
        claimId: args._[1] as string,
        force: args.force,
      });
      break;
    case 'prospect': {
      const role = args._[1] as string;
      if (!role) {
        console.error('Error: Prospect role required');
        console.error('Usage: paydirt prospect <role> [--task "task"] [--claim <id>] [--background] [--model <model>]');
        Deno.exit(1);
      }
      await prospectCommand({
        role,
        task: args.task as string,
        claimId: args.claim as string,
        dryRun: args['dry-run'],
        background: args.background,
        model: args.model as string,
      });
      break;
    }
    case 'boomtown':
      await launchZellijBoomtown();
      break;
    case 'attach':
      await attachCommand({ target: args._[1] as string });
      break;
    case 'list':
      await listCommand();
      break;
    case 'boss': {
      const subcommand = args._[1] as string;
      if (!subcommand || !['start', 'stop', 'status'].includes(subcommand)) {
        console.error('Error: boss subcommand required');
        console.error('Usage: paydirt boss <start|stop|status>');
        Deno.exit(1);
      }
      await bossCommand({
        subcommand: subcommand as 'start' | 'stop' | 'status',
        dryRun: args['dry-run'],
      });
      break;
    }
    case 'ledger':
      console.log('[TODO] View history');
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      Deno.exit(1);
  }
}

if (import.meta.main) {
  await initLangfuse();
  main();
}
