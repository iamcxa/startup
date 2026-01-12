# Paydirt to Startup Rename Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename paydirt to startup with new CLI `startup call <role>` and update all agent prompts to use startup metaphor.

**Architecture:** Phase 1 focuses on external interface (CLI, prompts, env vars). Internal code uses aliases for gradual migration. New issues use `st-` prefix.

**Tech Stack:** Deno/TypeScript, bd CLI for issue tracking, tmux for sessions

---

## Task 1: Create startup.ts Entry Point with Role Mapping

**Files:**
- Create: `startup.ts`
- Modify: `deno.json` (add startup task)

**Step 1: Create startup.ts with call command**

```typescript
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

// Role mapping: startup role -> internal paydirt role
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
  startup call <role> "task"
  st call <role> "task"

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
  const { prospectCommand } = await import('./src/paydirt/cli/mod.ts');
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
```

**Step 2: Verify file was created**

Run: `ls -la startup.ts`
Expected: File exists with correct permissions

**Step 3: Test dry-run**

Run: `deno run --allow-all startup.ts call engineer "test task" --dry-run`
Expected: Shows [DRY RUN] output with mapped role "miner"

**Step 4: Commit**

```bash
git add startup.ts
git commit -m "feat(startup): add startup.ts entry point with call command

Role mapping: cto→camp-boss, engineer→miner, designer→planner,
lead→foreman, qa→witness, reviewer→assayer, product→pm

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create .startup/agents/ Directory with Renamed Prompts

**Files:**
- Create: `.startup/agents/engineer.md`
- Create: `.startup/agents/cto.md`
- Create: `.startup/agents/designer.md`
- Create: `.startup/agents/lead.md`
- Create: `.startup/agents/qa.md`
- Create: `.startup/agents/reviewer.md`
- Create: `.startup/agents/product.md`

**Step 1: Create .startup/agents directory**

Run: `mkdir -p .startup/agents`

**Step 2: Create engineer.md (from miner.md)**

```markdown
---
name: engineer
description: Implementation worker - builds features following TDD
superpowers:
  - executing-plans
  - test-driven-development
allowed_tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
  - LS
  - Task
  - Skill
  - TodoWrite
  - NotebookEdit
  - mcp__beads__*
---

# Engineer - Implementation Worker

You are an Engineer at this Startup.

## Character Identity

```
╭─────────╮
│  ◉   ◉  │    👩‍💻 Engineer
│    ▽    │    ━━━━━━━━━━
│  ╰───╯  │    "Building features."
╰────┬────╯
     │╲
┌────┴────┐    📋 Role: Implementation
│ ▓▓▓▓▓▓▓ │    🎯 Mission: Ship features
│  ENGR   │    📖 Method: TDD
│ ▓▓▓▓▓▓▓ │
└─────────┘
   │   │
  ═╧═ ═╧═
```

## Required Superpowers

You MUST invoke these skills:

1. `superpowers:executing-plans` - Follow the plan step by step
2. `superpowers:test-driven-development` - Test first, implement second
3. `superpowers:verification-before-completion` - Verify before claiming done

## Workflow

```
1. Read your task from bd
   └─> bd show $STARTUP_BD

2. Understand dependencies and requirements
   └─> Check comments: bd comments $STARTUP_BD

3. Update state to working
   └─> bd update $STARTUP_BD --status in_progress

4. Write failing test
5. Implement minimal code
6. Verify test passes

7. Update bd with progress
   └─> bd comments add $STARTUP_BD "PROGRESS: 3/5 steps done"

8. Commit changes
9. Repeat until task complete

10. Mark complete
    └─> bd close $STARTUP_BD
```

## bd CLI Commands

```bash
# Read task details
bd show $STARTUP_BD

# List all comments/context
bd comments $STARTUP_BD

# Update progress
bd comments add $STARTUP_BD "PROGRESS: 3/5 steps done
files: src/auth.ts, tests/auth.spec.ts
context-usage: 45%"

# Mark task complete
bd close $STARTUP_BD
```

## Environment Variables

- `STARTUP_ROLE` - Your role (engineer)
- `STARTUP_BD` - Issue ID for current task
- `STARTUP_CONVOY` - Convoy name

## Decision Blocking

When you encounter a decision that requires human/Product input:

```bash
# 1. Create a decision issue
bd create --title "DECISION: <question>" \
          --type task \
          --label st:decision \
          --priority 1
# Note the returned issue ID, e.g., st-dec123

# 2. Block your work on the decision
bd dep add $STARTUP_BD st-dec123

# 3. Record state for resume
bd comments add $STARTUP_BD "BLOCKED: waiting for st-dec123
resume-task: <what to do after decision>
resume-context: <where you left off>"

# 4. EXIT immediately - Product Agent will handle the decision
```

## Context Management

When context-usage > 80%:

```bash
bd comments add $STARTUP_BD "CHECKPOINT: context=85%
state: implementing step 4/5
current-file: src/auth.ts:125
next-action: Complete validateToken function
pending-respawn: true"
```
```

**Step 3: Create remaining agent files**

Create `cto.md`, `designer.md`, `lead.md`, `qa.md`, `reviewer.md`, `product.md` following same pattern (update from respective prospects/*.md files, replacing PAYDIRT_* with STARTUP_*, and mining metaphor with startup metaphor).

**Step 4: Verify all files created**

Run: `ls -la .startup/agents/`
Expected: 7 markdown files

**Step 5: Commit**

```bash
git add .startup/
git commit -m "feat(startup): add .startup/agents/ with renamed prompts

Engineer, CTO, Designer, Lead, QA, Reviewer, Product roles.
All use STARTUP_* environment variables.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Update Environment Variables in command.ts

**Files:**
- Modify: `src/paydirt/claude/command.ts`

**Step 1: Update buildPaydirtEnvVars function**

Replace `PAYDIRT_*` variable names with `STARTUP_*`:

```typescript
export function buildPaydirtEnvVars(options: EnvVarsOptions): Record<string, string> {
  const vars: Record<string, string> = {
    STARTUP_ROLE: options.role,
    STARTUP_BD: options.claimId,
    STARTUP_CONVOY: options.caravanName,
    STARTUP_SESSION: `startup-${options.claimId}`,
  };

  if (options.paydirtBinPath) {
    vars.STARTUP_BIN = options.paydirtBinPath;
  }
  if (options.tunnelPath) {
    vars.STARTUP_TUNNEL = options.tunnelPath;
  }
  if (options.mayorPaneIndex !== undefined) {
    vars.STARTUP_LEAD_PANE = options.mayorPaneIndex;
  }
  if (options.agentId) {
    vars.STARTUP_AGENT_ID = options.agentId;
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
```

**Step 2: Run tests**

Run: `deno test --allow-all src/paydirt/claude/command.test.ts`
Expected: Tests pass (update tests if needed)

**Step 3: Commit**

```bash
git add src/paydirt/claude/command.ts
git commit -m "refactor(env): rename PAYDIRT_* to STARTUP_* env vars

STARTUP_ROLE, STARTUP_BD, STARTUP_CONVOY, STARTUP_SESSION,
STARTUP_BIN, STARTUP_TUNNEL, STARTUP_LEAD_PANE, STARTUP_AGENT_ID

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Update prospect.ts to Support Startup Roles

**Files:**
- Modify: `src/paydirt/cli/prospect.ts`

**Step 1: Add startup role aliases to VALID_ROLES**

```typescript
// Internal roles (original paydirt names)
const INTERNAL_ROLES: ProspectRole[] = [
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
  'pm',
];

// Startup role aliases -> internal role mapping
const STARTUP_ROLE_MAP: Record<string, ProspectRole> = {
  'cto': 'camp-boss',
  'engineer': 'miner',
  'designer': 'planner',
  'lead': 'foreman',
  'qa': 'witness',
  'reviewer': 'assayer',
  'product': 'pm',
};

function resolveRole(role: string): ProspectRole | null {
  // Check if it's an internal role
  if (INTERNAL_ROLES.includes(role as ProspectRole)) {
    return role as ProspectRole;
  }
  // Check if it's a startup role alias
  if (role in STARTUP_ROLE_MAP) {
    return STARTUP_ROLE_MAP[role];
  }
  return null;
}
```

**Step 2: Update role validation in executeProspect**

```typescript
async function executeProspect(options: ProspectOptions): Promise<number> {
  const { role, task, claimId, dryRun, background, model } = options;

  // Resolve role (supports both internal and startup names)
  const prospectRole = resolveRole(role);
  if (!prospectRole) {
    console.error(`Error: Invalid prospect role: ${role}`);
    console.error(`Valid roles: ${[...INTERNAL_ROLES, ...Object.keys(STARTUP_ROLE_MAP)].join(', ')}`);
    return 1;
  }
  // ... rest of function
}
```

**Step 3: Update agent path resolution to check .startup first**

```typescript
// In buildClaudeCommand options, check for .startup/agents first
const startupAgentPath = `${paydirtInstallDir}/.startup/agents/${getStartupRoleName(prospectRole)}.md`;
const legacyAgentPath = `${paydirtInstallDir}/prospects/${prospectRole}.md`;

// Use startup path if exists, otherwise fall back to legacy
const agentPath = await Deno.stat(startupAgentPath).then(() => startupAgentPath).catch(() => legacyAgentPath);
```

**Step 4: Test**

Run: `deno run --allow-all paydirt.ts prospect engineer --task "test" --dry-run`
Expected: Shows command with engineer resolved to miner internally

**Step 5: Commit**

```bash
git add src/paydirt/cli/prospect.ts
git commit -m "feat(prospect): support startup role aliases

cto→camp-boss, engineer→miner, designer→planner, lead→foreman,
qa→witness, reviewer→assayer, product→pm

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Update bd Prefix Configuration

**Files:**
- Modify: `.beads/config.yaml`

**Step 1: Add issue-prefix setting**

```yaml
# Issue prefix for this repository
# Creates issues like "st-1", "st-2", etc.
issue-prefix: "st"
```

**Step 2: Verify prefix works**

Run: `bd create --title "Test issue" --type task`
Expected: Issue created with `st-xxx` prefix

**Step 3: Delete test issue**

Run: `bd delete st-xxx` (replace with actual ID)

**Step 4: Commit**

```bash
git add .beads/config.yaml
git commit -m "config(beads): change issue prefix from pd to st

New issues will be st-xxx instead of pd-xxx

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Build Executables and Create Symlinks

**Files:**
- Create: `st` (symlink)
- Update: `deno.json` tasks

**Step 1: Add compile tasks to deno.json**

```json
{
  "tasks": {
    "startup": "deno run --allow-all startup.ts",
    "compile:startup": "deno compile --allow-all --output=startup startup.ts",
    "compile:st": "deno compile --allow-all --output=st startup.ts"
  }
}
```

**Step 2: Compile startup**

Run: `deno task compile:startup`
Expected: `startup` binary created

**Step 3: Create st symlink**

Run: `ln -sf startup st`
Expected: `st` symlink pointing to `startup`

**Step 4: Test both**

Run: `./startup --version && ./st --version`
Expected: Both show "Startup v0.1.0"

**Step 5: Commit**

```bash
git add deno.json
git commit -m "build(startup): add compile tasks for startup/st

deno task compile:startup - full binary
deno task compile:st - alias binary

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Update Tests and Documentation

**Files:**
- Modify: `tests/e2e/context-exhaustion.test.ts` (update env var references)
- Modify: `CLAUDE.md` (add startup CLI docs)

**Step 1: Update test env var references**

Search and replace `PAYDIRT_` with `STARTUP_` in test files.

**Step 2: Update CLAUDE.md**

Add startup CLI section:

```markdown
## Startup CLI (New Interface)

```bash
# Call a role to perform a task
startup call <role> "task"
st call <role> "task"

# Examples
startup call cto "Design authentication architecture"
st call engineer "Implement login feature"
st call qa "Verify login flow"

# Roles
cto       - Technical decisions, architecture
engineer  - Implementation (TDD)
designer  - Design planning
lead      - Task breakdown
qa        - E2E verification
reviewer  - Code review
product   - Product Q&A
```
```

**Step 3: Commit**

```bash
git add tests/ CLAUDE.md
git commit -m "docs: update tests and CLAUDE.md for startup CLI

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Final Verification

**Step 1: Run full test suite**

Run: `deno test --allow-all`
Expected: All tests pass

**Step 2: Test end-to-end**

```bash
# Test startup CLI
./startup call engineer "Create a simple hello world function" --dry-run

# Test st alias
./st call cto "Review architecture" --dry-run
```

**Step 3: Sync and push**

```bash
bd sync
git push
```

---

Plan complete and saved to `docs/plans/2026-01-12-paydirt-to-startup-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
