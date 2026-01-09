# Paydirt CLI POC Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement CLI-level POC demonstrating Event-Driven communication, Camp Boss daemon, and 4-role interaction.

**Architecture:** Claude Hooks (PostToolUse) detect bd comments and auto-spawn Prospects. Camp Boss runs as daemon in tmux. Message Bus uses bd comments with prefixes (QUESTION/ANSWER/OUTPUT/SPAWN).

**Tech Stack:** Deno, TypeScript, tmux, bd CLI, Claude Code Hooks

---

## Phase 1: Hook Infrastructure

### Task 1.1: Create Hook Shell Entry Point

**Files:**
- Create: `hooks/post-tool-use.sh`

**Step 1: Create hooks directory if needed**

```bash
mkdir -p hooks
```

**Step 2: Write the hook script**

```bash
#!/bin/bash
# hooks/post-tool-use.sh
# PostToolUse hook - dispatches based on bd comment prefix

set -e

# Only process if we're in a Paydirt context
[ -z "$PAYDIRT_CLAIM" ] && exit 0

# Read the tool output from stdin (Claude passes it)
TOOL_OUTPUT=$(cat)

# Check if this was a bd comments add command
if ! echo "$TOOL_OUTPUT" | grep -q "bd comments add"; then
  exit 0
fi

# Extract the comment content (rough parsing)
COMMENT=$(echo "$TOOL_OUTPUT" | grep -oP '(?<=bd comments add \$PAYDIRT_CLAIM ")[^"]+' || true)
[ -z "$COMMENT" ] && exit 0

# Get the prefix
PREFIX=$(echo "$COMMENT" | cut -d: -f1)

# Dispatch based on prefix
case "$PREFIX" in
  QUESTION)
    # Spawn Claim Agent in background
    if [ -n "$PAYDIRT_BIN" ]; then
      "$PAYDIRT_BIN" prospect claim-agent --claim "$PAYDIRT_CLAIM" &
    fi
    ;;
  SPAWN)
    # Parse: SPAWN: <role> --task "<task>"
    ROLE=$(echo "$COMMENT" | sed 's/SPAWN: //' | cut -d' ' -f1)
    TASK=$(echo "$COMMENT" | grep -oP '(?<=--task ")[^"]+' || echo "")
    if [ -n "$PAYDIRT_BIN" ] && [ -n "$ROLE" ]; then
      "$PAYDIRT_BIN" prospect "$ROLE" --claim "$PAYDIRT_CLAIM" --task "$TASK" &
    fi
    ;;
  *)
    # Other prefixes - no action needed
    ;;
esac

exit 0
```

**Step 3: Make executable**

```bash
chmod +x hooks/post-tool-use.sh
```

**Step 4: Verify script syntax**

Run: `bash -n hooks/post-tool-use.sh`
Expected: No output (syntax OK)

**Step 5: Commit**

```bash
git add hooks/post-tool-use.sh
git commit -m "feat(hooks): add PostToolUse dispatcher script"
```

---

### Task 1.2: Create Hook TypeScript Module

**Files:**
- Create: `src/paydirt/hooks/mod.ts`
- Create: `src/paydirt/hooks/dispatcher.ts`

**Step 1: Create hooks directory**

```bash
mkdir -p src/paydirt/hooks
```

**Step 2: Write dispatcher.ts**

```typescript
// src/paydirt/hooks/dispatcher.ts

/**
 * Message prefixes used in bd comments for inter-Prospect communication.
 */
export type MessagePrefix =
  | 'QUESTION'
  | 'ANSWER'
  | 'OUTPUT'
  | 'PROGRESS'
  | 'SPAWN'
  | 'DECISION'
  | 'CHECKPOINT';

/**
 * Parse a bd comment to extract prefix and content.
 */
export function parseComment(comment: string): { prefix: MessagePrefix | null; content: string } {
  const match = comment.match(/^([A-Z]+):\s*(.*)$/s);
  if (!match) {
    return { prefix: null, content: comment };
  }

  const prefix = match[1] as MessagePrefix;
  const validPrefixes: MessagePrefix[] = [
    'QUESTION',
    'ANSWER',
    'OUTPUT',
    'PROGRESS',
    'SPAWN',
    'DECISION',
    'CHECKPOINT',
  ];

  if (!validPrefixes.includes(prefix)) {
    return { prefix: null, content: comment };
  }

  return { prefix, content: match[2].trim() };
}

/**
 * Parse SPAWN command content.
 * Format: "SPAWN: <role> --task "<task>""
 */
export function parseSpawnCommand(content: string): { role: string; task: string } | null {
  // content is everything after "SPAWN: "
  const parts = content.split(/\s+/);
  if (parts.length === 0) return null;

  const role = parts[0];
  const taskMatch = content.match(/--task\s+"([^"]+)"/);
  const task = taskMatch ? taskMatch[1] : '';

  return { role, task };
}

/**
 * Determine what action to take based on message prefix.
 */
export interface DispatchAction {
  type: 'spawn' | 'notify' | 'log' | 'none';
  role?: string;
  task?: string;
  message?: string;
}

export function getDispatchAction(prefix: MessagePrefix | null, content: string): DispatchAction {
  switch (prefix) {
    case 'QUESTION':
      return { type: 'spawn', role: 'claim-agent' };

    case 'SPAWN': {
      const parsed = parseSpawnCommand(content);
      if (parsed) {
        return { type: 'spawn', role: parsed.role, task: parsed.task };
      }
      return { type: 'none' };
    }

    case 'OUTPUT':
    case 'ANSWER':
      return { type: 'notify', message: content };

    case 'PROGRESS':
    case 'DECISION':
    case 'CHECKPOINT':
      return { type: 'log', message: content };

    default:
      return { type: 'none' };
  }
}
```

**Step 3: Write mod.ts**

```typescript
// src/paydirt/hooks/mod.ts

export {
  type DispatchAction,
  getDispatchAction,
  type MessagePrefix,
  parseComment,
  parseSpawnCommand,
} from './dispatcher.ts';
```

**Step 4: Run type check**

Run: `deno check src/paydirt/hooks/mod.ts`
Expected: No errors

**Step 5: Commit**

```bash
git add src/paydirt/hooks/
git commit -m "feat(hooks): add message dispatcher module"
```

---

### Task 1.3: Add Hook Dispatcher Tests

**Files:**
- Create: `src/paydirt/hooks/dispatcher.test.ts`

**Step 1: Write tests**

```typescript
// src/paydirt/hooks/dispatcher.test.ts

import { assertEquals } from '@std/assert';
import {
  getDispatchAction,
  parseComment,
  parseSpawnCommand,
} from './dispatcher.ts';

Deno.test('parseComment - extracts QUESTION prefix', () => {
  const result = parseComment('QUESTION: Which auth provider?');
  assertEquals(result.prefix, 'QUESTION');
  assertEquals(result.content, 'Which auth provider?');
});

Deno.test('parseComment - extracts SPAWN prefix with task', () => {
  const result = parseComment('SPAWN: surveyor --task "Design auth system"');
  assertEquals(result.prefix, 'SPAWN');
  assertEquals(result.content, 'surveyor --task "Design auth system"');
});

Deno.test('parseComment - returns null prefix for non-prefixed text', () => {
  const result = parseComment('Just a regular comment');
  assertEquals(result.prefix, null);
  assertEquals(result.content, 'Just a regular comment');
});

Deno.test('parseComment - handles multiline content', () => {
  const result = parseComment('OUTPUT: design=docs/plans/auth.md\nfiles: 3');
  assertEquals(result.prefix, 'OUTPUT');
  assertEquals(result.content, 'design=docs/plans/auth.md\nfiles: 3');
});

Deno.test('parseSpawnCommand - parses role and task', () => {
  const result = parseSpawnCommand('surveyor --task "Design the feature"');
  assertEquals(result?.role, 'surveyor');
  assertEquals(result?.task, 'Design the feature');
});

Deno.test('parseSpawnCommand - parses role without task', () => {
  const result = parseSpawnCommand('claim-agent');
  assertEquals(result?.role, 'claim-agent');
  assertEquals(result?.task, '');
});

Deno.test('getDispatchAction - QUESTION spawns claim-agent', () => {
  const action = getDispatchAction('QUESTION', 'Which provider?');
  assertEquals(action.type, 'spawn');
  assertEquals(action.role, 'claim-agent');
});

Deno.test('getDispatchAction - SPAWN spawns specified role', () => {
  const action = getDispatchAction('SPAWN', 'surveyor --task "Design"');
  assertEquals(action.type, 'spawn');
  assertEquals(action.role, 'surveyor');
  assertEquals(action.task, 'Design');
});

Deno.test('getDispatchAction - OUTPUT notifies', () => {
  const action = getDispatchAction('OUTPUT', 'design=docs/plans/x.md');
  assertEquals(action.type, 'notify');
});

Deno.test('getDispatchAction - PROGRESS logs', () => {
  const action = getDispatchAction('PROGRESS', '3/5 steps done');
  assertEquals(action.type, 'log');
});
```

**Step 2: Run tests**

Run: `deno test src/paydirt/hooks/dispatcher.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/paydirt/hooks/dispatcher.test.ts
git commit -m "test(hooks): add dispatcher unit tests"
```

---

### Task 1.4: Create Claude Settings for Hooks

**Files:**
- Create: `.claude/settings.json`

**Step 1: Create .claude directory**

```bash
mkdir -p .claude
```

**Step 2: Write settings.json**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/hooks/post-tool-use.sh"
          }
        ]
      }
    ]
  }
}
```

**Step 3: Verify JSON syntax**

Run: `deno eval "console.log(JSON.parse(Deno.readTextFileSync('.claude/settings.json')))"`
Expected: Parsed object output

**Step 4: Commit**

```bash
git add .claude/settings.json
git commit -m "feat(hooks): add Claude PostToolUse hook configuration"
```

---

## Phase 2: Claim Agent Ledger Flow

### Task 2.1: Create Ledger Module

**Files:**
- Create: `src/paydirt/ledger/mod.ts`

**Step 1: Create ledger directory**

```bash
mkdir -p src/paydirt/ledger
```

**Step 2: Write mod.ts**

```typescript
// src/paydirt/ledger/mod.ts

/**
 * Decision Ledger operations.
 * The Ledger is a bd epic that stores all Claim Agent decisions.
 */

const LEDGER_LABEL = 'pd:ledger';
const LEDGER_TITLE = 'Decision Ledger';

/**
 * Find existing ledger or return null.
 */
export async function findLedger(): Promise<string | null> {
  const cmd = new Deno.Command('bd', {
    args: ['list', '--label', LEDGER_LABEL, '--type', 'epic', '--limit', '1', '--brief'],
    stdout: 'piped',
    stderr: 'null',
  });

  const result = await cmd.output();
  if (!result.success) return null;

  const output = new TextDecoder().decode(result.stdout).trim();
  if (!output) return null;

  // Output format: "pd-xxx: Decision Ledger"
  const match = output.match(/^(\S+):/);
  return match ? match[1] : null;
}

/**
 * Create a new ledger.
 */
export async function createLedger(): Promise<string | null> {
  const cmd = new Deno.Command('bd', {
    args: [
      'create',
      '--title', LEDGER_TITLE,
      '--type', 'epic',
      '--label', LEDGER_LABEL,
      '--brief',
    ],
    stdout: 'piped',
    stderr: 'piped',
  });

  const result = await cmd.output();
  if (!result.success) {
    console.error('Failed to create ledger:', new TextDecoder().decode(result.stderr));
    return null;
  }

  const output = new TextDecoder().decode(result.stdout).trim();
  // Output format: "Created: pd-xxx"
  const match = output.match(/(?:Created:|^)(\S+)/);
  return match ? match[1] : null;
}

/**
 * Ensure ledger exists, creating if needed.
 */
export async function ensureLedger(): Promise<string> {
  const existing = await findLedger();
  if (existing) return existing;

  const created = await createLedger();
  if (!created) {
    throw new Error('Failed to create Decision Ledger');
  }
  return created;
}

/**
 * Get decision history from ledger.
 */
export async function getDecisionHistory(ledgerId: string): Promise<string[]> {
  const cmd = new Deno.Command('bd', {
    args: ['comments', ledgerId],
    stdout: 'piped',
    stderr: 'null',
  });

  const result = await cmd.output();
  if (!result.success) return [];

  const output = new TextDecoder().decode(result.stdout);
  const lines = output.split('\n');

  // Filter for DECISION prefix
  return lines.filter((line) => line.startsWith('DECISION'));
}

/**
 * Add a decision to the ledger.
 */
export async function addDecision(
  ledgerId: string,
  caravanId: string,
  question: string,
  answer: string,
  confidence: 'high' | 'medium' | 'low' | 'escalated',
  source: string,
  reasoning: string,
): Promise<boolean> {
  const comment = `DECISION caravan=${caravanId}
Q: ${question}
A: ${answer}
Confidence: ${confidence}
Source: ${source}
Reasoning: ${reasoning}`;

  const cmd = new Deno.Command('bd', {
    args: ['comments', 'add', ledgerId, comment],
    stdout: 'null',
    stderr: 'piped',
  });

  const result = await cmd.output();
  return result.success;
}
```

**Step 3: Run type check**

Run: `deno check src/paydirt/ledger/mod.ts`
Expected: No errors

**Step 4: Commit**

```bash
git add src/paydirt/ledger/
git commit -m "feat(ledger): add Decision Ledger module"
```

---

### Task 2.2: Update claim-agent.md with Ledger Step

**Files:**
- Modify: `prospects/claim-agent.md`

**Step 1: Read current file**

The file already exists. We need to add Step 1.5 after Step 1.

**Step 2: Add Ledger loading step after "### Step 1: Greet and State Purpose"**

Find the section "### Step 2: Load Context File" and insert before it:

```markdown
### Step 1.5: Load Decision Ledger History

Before answering any questions, load previous decisions for consistency:

```bash
# Find the Decision Ledger
LEDGER=$(bd list --label pd:ledger --type epic --limit 1 --brief | head -1 | cut -d: -f1)

if [ -n "$LEDGER" ]; then
  echo "Loading decision history from $LEDGER..."
  bd comments $LEDGER | grep "^DECISION"
else
  echo "No Decision Ledger found - will create one on first decision"
fi
```

Parse the history to:
- Identify previous decisions for similar questions
- Maintain consistency with past choices
- Understand established patterns
```

**Step 3: Commit**

```bash
git add prospects/claim-agent.md
git commit -m "docs(claim-agent): add Ledger loading step"
```

---

## Phase 3: Prospect Spawning in tmux

### Task 3.1: Update prospect.ts to Actually Launch Claude

**Files:**
- Modify: `src/paydirt/cli/prospect.ts`

**Step 1: Write the updated prospect.ts**

```typescript
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
```

**Step 2: Run type check**

Run: `deno check src/paydirt/cli/prospect.ts`
Expected: No errors

**Step 3: Test with dry-run**

Run: `deno run --allow-all paydirt.ts prospect surveyor --task "Test task" --dry-run`
Expected: Shows Claude command that would be executed

**Step 4: Commit**

```bash
git add src/paydirt/cli/prospect.ts
git commit -m "feat(cli): implement prospect command with tmux spawning"
```

---

### Task 3.2: Add --background Flag to CLI Parser

**Files:**
- Modify: `paydirt.ts`

**Step 1: Update prospect case in main switch**

Find the `case 'prospect':` section and update to handle background flag:

```typescript
    case 'prospect': {
      const role = args._[1] as string;
      if (!role) {
        console.error('Error: Prospect role required');
        console.error('Usage: paydirt prospect <role> [--task "task"] [--claim <id>] [--background]');
        Deno.exit(1);
      }
      await prospectCommand({
        role,
        task: args.task as string,
        claimId: args.claim as string,
        dryRun: args['dry-run'],
        background: args.background,
      });
      break;
    }
```

**Step 2: Update parseArgs to include background**

```typescript
  const args = parseArgs(Deno.args, {
    boolean: ['help', 'version', 'dry-run', 'force', 'background'],
    string: ['task', 'claim'],
    alias: {
      h: 'help',
      v: 'version',
      f: 'force',
      b: 'background',
    },
  });
```

**Step 3: Run type check**

Run: `deno check paydirt.ts`
Expected: No errors

**Step 4: Commit**

```bash
git add paydirt.ts
git commit -m "feat(cli): add --background flag for prospect command"
```

---

## Phase 4: Camp Boss Daemon

### Task 4.1: Create Boss CLI Module

**Files:**
- Create: `src/paydirt/cli/boss.ts`

**Step 1: Write boss.ts**

```typescript
// src/paydirt/cli/boss.ts

/**
 * Camp Boss daemon management commands.
 */

const BOSS_SESSION = 'pd-boss';

/**
 * Check if Camp Boss daemon is running.
 */
async function isDaemonRunning(): Promise<boolean> {
  const cmd = new Deno.Command('tmux', {
    args: ['has-session', '-t', BOSS_SESSION],
    stdout: 'null',
    stderr: 'null',
  });
  const result = await cmd.output();
  return result.success;
}

/**
 * Get paydirt binary path for spawning.
 */
function getPaydirtBin(): string {
  // Check for compiled binary first
  const cwdBin = `${Deno.cwd()}/paydirt`;
  try {
    Deno.statSync(cwdBin);
    return cwdBin;
  } catch {
    // Fall back to script
    return `deno run --allow-all ${Deno.cwd()}/paydirt.ts`;
  }
}

export interface BossOptions {
  subcommand: 'start' | 'stop' | 'status';
  dryRun?: boolean;
}

export async function bossCommand(options: BossOptions): Promise<void> {
  const { subcommand, dryRun } = options;

  switch (subcommand) {
    case 'start':
      await startDaemon(dryRun);
      break;
    case 'stop':
      await stopDaemon(dryRun);
      break;
    case 'status':
      await showStatus();
      break;
  }
}

async function startDaemon(dryRun?: boolean): Promise<void> {
  if (await isDaemonRunning()) {
    console.log('Camp Boss daemon is already running');
    console.log(`Attach with: tmux attach -t ${BOSS_SESSION}`);
    return;
  }

  const paydirtBin = getPaydirtBin();
  const projectDir = Deno.cwd();

  // Build command to spawn camp-boss prospect
  const command = `${paydirtBin} prospect camp-boss --background`;

  if (dryRun) {
    console.log('[DRY RUN] Would create tmux session:');
    console.log(`  Session: ${BOSS_SESSION}`);
    console.log(`  Command: ${command}`);
    return;
  }

  console.log('Starting Camp Boss daemon...');

  const cmd = new Deno.Command('tmux', {
    args: [
      'new-session',
      '-d',
      '-s', BOSS_SESSION,
      '-n', 'camp-boss',
      '-c', projectDir,
      command,
    ],
    stdout: 'piped',
    stderr: 'piped',
  });

  const result = await cmd.output();

  if (!result.success) {
    console.error('Failed to start Camp Boss daemon');
    console.error(new TextDecoder().decode(result.stderr));
    Deno.exit(1);
  }

  console.log('Camp Boss daemon started');
  console.log(`Session: ${BOSS_SESSION}`);
  console.log(`Attach with: pd attach boss`);
}

async function stopDaemon(dryRun?: boolean): Promise<void> {
  if (!(await isDaemonRunning())) {
    console.log('Camp Boss daemon is not running');
    return;
  }

  if (dryRun) {
    console.log('[DRY RUN] Would kill tmux session:', BOSS_SESSION);
    return;
  }

  console.log('Stopping Camp Boss daemon...');

  const cmd = new Deno.Command('tmux', {
    args: ['kill-session', '-t', BOSS_SESSION],
    stdout: 'null',
    stderr: 'piped',
  });

  const result = await cmd.output();

  if (!result.success) {
    console.error('Failed to stop Camp Boss daemon');
    Deno.exit(1);
  }

  console.log('Camp Boss daemon stopped');
}

async function showStatus(): Promise<void> {
  const running = await isDaemonRunning();

  console.log('Camp Boss Daemon Status');
  console.log('=======================');
  console.log(`Status: ${running ? 'RUNNING' : 'STOPPED'}`);
  console.log(`Session: ${BOSS_SESSION}`);

  if (running) {
    console.log('');
    console.log('Commands:');
    console.log('  pd boss stop     Stop the daemon');
    console.log('  pd attach boss   Attach to daemon session');
  } else {
    console.log('');
    console.log('Commands:');
    console.log('  pd boss start    Start the daemon');
  }
}
```

**Step 2: Run type check**

Run: `deno check src/paydirt/cli/boss.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/paydirt/cli/boss.ts
git commit -m "feat(cli): add boss daemon management commands"
```

---

### Task 4.2: Wire Boss Command to Main CLI

**Files:**
- Modify: `src/paydirt/cli/mod.ts`
- Modify: `paydirt.ts`

**Step 1: Update mod.ts exports**

```typescript
// src/paydirt/cli/mod.ts
export { stakeCommand } from './stake.ts';
export { surveyCommand } from './survey.ts';
export { continueCommand } from './continue.ts';
export { abandonCommand } from './abandon.ts';
export { prospectCommand } from './prospect.ts';
export { bossCommand } from './boss.ts';
```

**Step 2: Update paydirt.ts imports and add boss case**

Add to imports:
```typescript
import {
  abandonCommand,
  bossCommand,
  continueCommand,
  prospectCommand,
  stakeCommand,
  surveyCommand,
} from './src/paydirt/cli/mod.ts';
```

Add case before default:
```typescript
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
```

**Step 3: Run type check**

Run: `deno check paydirt.ts`
Expected: No errors

**Step 4: Test boss status**

Run: `deno run --allow-all paydirt.ts boss status`
Expected: Shows "Status: STOPPED"

**Step 5: Commit**

```bash
git add src/paydirt/cli/mod.ts paydirt.ts
git commit -m "feat(cli): wire boss command to main CLI"
```

---

## Phase 5: tmux CLI Wrappers

### Task 5.1: Create Attach Command

**Files:**
- Create: `src/paydirt/cli/attach.ts`

**Step 1: Write attach.ts**

```typescript
// src/paydirt/cli/attach.ts

/**
 * Attach to a Paydirt tmux session.
 */

export interface AttachOptions {
  target?: string;
}

/**
 * List all paydirt tmux sessions.
 */
async function listPaydirtSessions(): Promise<string[]> {
  const cmd = new Deno.Command('tmux', {
    args: ['list-sessions', '-F', '#{session_name}'],
    stdout: 'piped',
    stderr: 'null',
  });

  const result = await cmd.output();
  if (!result.success) return [];

  const output = new TextDecoder().decode(result.stdout);
  return output
    .trim()
    .split('\n')
    .filter((s) => s.startsWith('paydirt-') || s === 'pd-boss');
}

export async function attachCommand(options: AttachOptions): Promise<void> {
  const { target } = options;

  // If no target, list available sessions
  if (!target) {
    const sessions = await listPaydirtSessions();
    if (sessions.length === 0) {
      console.log('No Paydirt sessions found');
      console.log('Start a Caravan with: pd stake "task"');
      console.log('Or start Camp Boss with: pd boss start');
      return;
    }

    console.log('Available Paydirt sessions:');
    for (const session of sessions) {
      const label = session === 'pd-boss' ? '(Camp Boss daemon)' : '(Caravan)';
      console.log(`  ${session} ${label}`);
    }
    console.log('');
    console.log('Attach with: pd attach <session-name>');
    return;
  }

  // Resolve target to session name
  let sessionName: string;
  if (target === 'boss') {
    sessionName = 'pd-boss';
  } else if (target.startsWith('paydirt-')) {
    sessionName = target;
  } else {
    sessionName = `paydirt-${target}`;
  }

  // Check if session exists
  const cmd = new Deno.Command('tmux', {
    args: ['has-session', '-t', sessionName],
    stdout: 'null',
    stderr: 'null',
  });
  const check = await cmd.output();

  if (!check.success) {
    console.error(`Session not found: ${sessionName}`);
    const sessions = await listPaydirtSessions();
    if (sessions.length > 0) {
      console.log('Available sessions:', sessions.join(', '));
    }
    Deno.exit(1);
  }

  // Attach to session
  const attachCmd = new Deno.Command('tmux', {
    args: ['attach-session', '-t', sessionName],
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  await attachCmd.output();
}
```

**Step 2: Run type check**

Run: `deno check src/paydirt/cli/attach.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/paydirt/cli/attach.ts
git commit -m "feat(cli): add attach command for tmux sessions"
```

---

### Task 5.2: Create List Command

**Files:**
- Create: `src/paydirt/cli/list.ts`

**Step 1: Write list.ts**

```typescript
// src/paydirt/cli/list.ts

/**
 * List all Paydirt tmux sessions.
 */

interface SessionInfo {
  name: string;
  windows: number;
  created: string;
  attached: boolean;
}

async function getSessionInfo(): Promise<SessionInfo[]> {
  const cmd = new Deno.Command('tmux', {
    args: [
      'list-sessions',
      '-F',
      '#{session_name}|#{session_windows}|#{session_created}|#{session_attached}',
    ],
    stdout: 'piped',
    stderr: 'null',
  });

  const result = await cmd.output();
  if (!result.success) return [];

  const output = new TextDecoder().decode(result.stdout);
  const sessions: SessionInfo[] = [];

  for (const line of output.trim().split('\n')) {
    if (!line) continue;
    const [name, windows, created, attached] = line.split('|');

    // Filter to paydirt sessions only
    if (!name.startsWith('paydirt-') && name !== 'pd-boss') continue;

    sessions.push({
      name,
      windows: parseInt(windows, 10),
      created: new Date(parseInt(created, 10) * 1000).toLocaleString(),
      attached: attached === '1',
    });
  }

  return sessions;
}

export async function listCommand(): Promise<void> {
  const sessions = await getSessionInfo();

  if (sessions.length === 0) {
    console.log('No Paydirt sessions found');
    console.log('');
    console.log('Start a Caravan with: pd stake "task"');
    console.log('Or start Camp Boss with: pd boss start');
    return;
  }

  console.log('Paydirt Sessions');
  console.log('================');
  console.log('');

  for (const session of sessions) {
    const type = session.name === 'pd-boss' ? 'daemon' : 'caravan';
    const status = session.attached ? '(attached)' : '';
    console.log(`${session.name} [${type}] ${status}`);
    console.log(`  Windows: ${session.windows}`);
    console.log(`  Created: ${session.created}`);
    console.log('');
  }

  console.log('Commands:');
  console.log('  pd attach <name>  Attach to session');
  console.log('  pd abandon <id>   Stop a Caravan');
  console.log('  pd boss stop      Stop Camp Boss daemon');
}
```

**Step 2: Run type check**

Run: `deno check src/paydirt/cli/list.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/paydirt/cli/list.ts
git commit -m "feat(cli): add list command for tmux sessions"
```

---

### Task 5.3: Wire Attach and List to Main CLI

**Files:**
- Modify: `src/paydirt/cli/mod.ts`
- Modify: `paydirt.ts`

**Step 1: Update mod.ts exports**

```typescript
// src/paydirt/cli/mod.ts
export { stakeCommand } from './stake.ts';
export { surveyCommand } from './survey.ts';
export { continueCommand } from './continue.ts';
export { abandonCommand } from './abandon.ts';
export { prospectCommand } from './prospect.ts';
export { bossCommand } from './boss.ts';
export { attachCommand } from './attach.ts';
export { listCommand } from './list.ts';
```

**Step 2: Update paydirt.ts imports**

```typescript
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
```

**Step 3: Add cases to switch**

```typescript
    case 'attach':
      await attachCommand({ target: args._[1] as string });
      break;

    case 'list':
      await listCommand();
      break;
```

**Step 4: Update printHelp**

Add to the help text:
```
  attach [target]   Attach to tmux session (use 'boss' for daemon)
  list              List all Paydirt tmux sessions
```

**Step 5: Run type check**

Run: `deno check paydirt.ts`
Expected: No errors

**Step 6: Test list command**

Run: `deno run --allow-all paydirt.ts list`
Expected: Shows "No Paydirt sessions found" or lists sessions

**Step 7: Commit**

```bash
git add src/paydirt/cli/mod.ts paydirt.ts
git commit -m "feat(cli): wire attach and list commands"
```

---

## Phase 6: Integration Testing

### Task 6.1: Create Integration Test Script

**Files:**
- Create: `tests/integration/poc-flow.test.ts`

**Step 1: Create test directory**

```bash
mkdir -p tests/integration
```

**Step 2: Write integration test**

```typescript
// tests/integration/poc-flow.test.ts

import { assertEquals } from '@std/assert';

/**
 * Integration test for POC flow.
 * Tests: Hook → Claim Agent spawn → Answer → Surveyor spawn → Output
 *
 * Note: This test requires bd CLI to be available.
 */

Deno.test({
  name: 'POC Integration: Hook dispatcher parses bd comments correctly',
  async fn() {
    const { parseComment, getDispatchAction } = await import(
      '../../src/paydirt/hooks/dispatcher.ts'
    );

    // Test QUESTION triggers claim-agent spawn
    const q = parseComment('QUESTION: Which database?');
    const qAction = getDispatchAction(q.prefix, q.content);
    assertEquals(qAction.type, 'spawn');
    assertEquals(qAction.role, 'claim-agent');

    // Test SPAWN triggers role spawn
    const s = parseComment('SPAWN: surveyor --task "Design auth"');
    const sAction = getDispatchAction(s.prefix, s.content);
    assertEquals(sAction.type, 'spawn');
    assertEquals(sAction.role, 'surveyor');
    assertEquals(sAction.task, 'Design auth');

    // Test OUTPUT triggers notify
    const o = parseComment('OUTPUT: design=docs/plans/auth.md');
    const oAction = getDispatchAction(o.prefix, o.content);
    assertEquals(oAction.type, 'notify');
  },
});

Deno.test({
  name: 'POC Integration: Boss command returns correct status',
  async fn() {
    const cmd = new Deno.Command('deno', {
      args: ['run', '--allow-all', 'paydirt.ts', 'boss', 'status'],
      stdout: 'piped',
      stderr: 'piped',
      cwd: Deno.cwd(),
    });

    const result = await cmd.output();
    const output = new TextDecoder().decode(result.stdout);

    // Should contain status line
    assertEquals(output.includes('Status:'), true);
  },
});

Deno.test({
  name: 'POC Integration: List command works without sessions',
  async fn() {
    const cmd = new Deno.Command('deno', {
      args: ['run', '--allow-all', 'paydirt.ts', 'list'],
      stdout: 'piped',
      stderr: 'piped',
      cwd: Deno.cwd(),
    });

    const result = await cmd.output();
    const output = new TextDecoder().decode(result.stdout);

    // Should either show sessions or "No Paydirt sessions found"
    const hasContent = output.includes('Paydirt') || output.includes('No Paydirt sessions');
    assertEquals(hasContent, true);
  },
});
```

**Step 3: Run integration tests**

Run: `deno test tests/integration/poc-flow.test.ts --allow-all`
Expected: All tests pass

**Step 4: Commit**

```bash
git add tests/integration/
git commit -m "test(integration): add POC flow integration tests"
```

---

### Task 6.2: Update README with POC Usage

**Files:**
- Modify: `README.md`

**Step 1: Add POC section to README**

Add after the existing content:

```markdown
## POC Usage

### Quick Start

```bash
# 1. Start Camp Boss daemon
pd boss start

# 2. Open dashboard (optional)
pd boomtown

# 3. Start a Caravan
pd stake "Implement user authentication"

# 4. Check status
pd list
pd boss status

# 5. Attach to sessions
pd attach boss           # Camp Boss daemon
pd attach pd-abc123      # Specific Caravan
```

### Event-Driven Flow

The POC demonstrates automatic Prospect spawning via Claude Hooks:

1. Trail Boss writes `QUESTION: Which auth provider?`
2. PostToolUse hook detects the prefix
3. Hook automatically spawns Claim Agent
4. Claim Agent reads Ledger, answers, writes to Ledger
5. Trail Boss writes `SPAWN: surveyor --task "Design auth"`
6. Hook spawns Surveyor
7. Surveyor completes design, writes `OUTPUT: design=...`

### Commands

| Command | Description |
|---------|-------------|
| `pd boss start` | Start Camp Boss daemon |
| `pd boss stop` | Stop daemon |
| `pd boss status` | Check daemon status |
| `pd stake "task"` | Start new Caravan |
| `pd prospect <role>` | Spawn specific Prospect |
| `pd attach [target]` | Attach to tmux session |
| `pd list` | List all sessions |
| `pd boomtown` | Open dashboard |
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add POC usage guide to README"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `deno test --allow-all` - All tests pass
- [ ] `deno check paydirt.ts` - No type errors
- [ ] `pd boss start` - Daemon starts
- [ ] `pd boss status` - Shows RUNNING
- [ ] `pd list` - Shows pd-boss session
- [ ] `pd attach boss` - Attaches to daemon
- [ ] `pd boss stop` - Daemon stops
- [ ] `pd prospect surveyor --task "Test" --dry-run` - Shows command
- [ ] Hook script syntax OK: `bash -n hooks/post-tool-use.sh`
