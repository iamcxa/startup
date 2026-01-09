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
import {
  abandonCommand,
  continueCommand,
  prospectCommand,
  stakeCommand,
  surveyCommand,
} from './src/paydirt/cli/mod.ts';
import { launchBoomtown } from './src/paydirt/boomtown/mod.ts';

const VERSION = '0.1.0';

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
  ledger            View history

Options:
  -h, --help        Show this help
  -v, --version     Show version
  --dry-run         Preview without executing
`);
}

async function main(): Promise<void> {
  const args = parseArgs(Deno.args, {
    boolean: ['help', 'version', 'dry-run', 'force'],
    string: ['task', 'claim'],
    alias: {
      h: 'help',
      v: 'version',
      f: 'force',
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
        console.error('Usage: paydirt prospect <role> [--task "task"] [--claim <id>]');
        Deno.exit(1);
      }
      prospectCommand({
        role,
        task: args.task as string,
        claimId: args.claim as string,
        dryRun: args['dry-run'],
      });
      break;
    }
    case 'boomtown':
      await launchBoomtown();
      break;
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
  main();
}
