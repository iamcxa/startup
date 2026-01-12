# Fix Integration Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 15 failing integration tests by adding missing CLI commands and updating terminology.

**Architecture:** Add `kickoff`, `company`, `list`, `attach` commands to startup.ts; update tests to use `call` instead of `prospect`; rename caravan→team, boss→company throughout.

**Tech Stack:** Deno, TypeScript, tmux

---

## Terminology Changes

| Old | New |
|-----|-----|
| `stake` | `kickoff` |
| `caravan` | `team` |
| `boss` | `company` |
| `pd:caravan` label | `st:team` label |
| `pd-boss` session | `startup-company` session |
| `Camp Boss` | `Company HQ` |

---

## Task 1: Update startup.ts - Add Commands

**Files:**
- Modify: `startup.ts`

**Step 1: Add command cases to switch statement**

Add after the existing `call` case (around line 170):

```typescript
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
```

**Step 2: Update printHelp function**

```typescript
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
  startup kickoff "Build user authentication"
  startup call engineer "Implement login feature"
  startup company start
  startup list
`);
}
```

**Step 3: Run type check**

```bash
deno check startup.ts
```

**Step 4: Commit**

```bash
git add startup.ts
git commit -m "feat(cli): add kickoff, company, list, attach commands"
```

---

## Task 2: Update boss.ts - Rename to Company

**Files:**
- Modify: `src/startup/cli/boss.ts`

**Changes:**
1. `BOSS_SESSION = 'pd-boss'` → `COMPANY_SESSION = 'startup-company'`
2. `BOSS_LOG_LABEL = 'pd:camp-boss'` → `COMPANY_LOG_LABEL = 'st:company'`
3. `BOSS_LOG_TITLE = 'Camp Boss Command Log'` → `COMPANY_LOG_TITLE = 'Company HQ Command Log'`
4. All "Camp Boss" text → "Company HQ"
5. All "pd boss" commands in output → "startup company"
6. All "pd attach boss" → "startup attach company"

**Step 1: Apply changes with sed or manual edit**

**Step 2: Run type check**

```bash
deno check src/startup/cli/boss.ts
```

**Step 3: Commit**

```bash
git add src/startup/cli/boss.ts
git commit -m "refactor(cli): rename boss → company, Camp Boss → Company HQ"
```

---

## Task 3: Update stake.ts - Rename to Team

**Files:**
- Modify: `src/startup/cli/stake.ts`

**Changes:**
1. `pd:caravan` label → `st:team`
2. `caravanName` variable → `teamName`
3. "Caravan" text → "Team"
4. `createCaravanIssue` → `createTeamIssue`
5. `notifyNewCaravan` → `notifyNewTeam`
6. `/tmp/startup-new-caravans` → `/tmp/startup-new-teams`

**Step 1: Apply changes**

**Step 2: Run type check**

```bash
deno check src/startup/cli/stake.ts
```

**Step 3: Commit**

```bash
git add src/startup/cli/stake.ts
git commit -m "refactor(cli): rename caravan → team in stake command"
```

---

## Task 4: Update list.ts and attach.ts - Team Terminology

**Files:**
- Modify: `src/startup/cli/list.ts`
- Modify: `src/startup/cli/attach.ts`

**list.ts changes:**
1. `'caravan'` type → `'team'`
2. `pd-boss` → `startup-company`
3. `'daemon'` → `'company'`
4. Output text: "pd stake" → "startup kickoff"
5. Output text: "pd boss" → "startup company"
6. Output text: "pd attach" → "startup attach"
7. Output text: "pd abandon" → "startup abandon"

**attach.ts changes:**
1. `pd-boss` → `startup-company`
2. `'boss'` shortcut → `'company'`
3. "(Caravan)" → "(Team)"
4. "(Camp Boss daemon)" → "(Company HQ)"
5. Output text updates

**Step 1: Apply changes to both files**

**Step 2: Run type check**

```bash
deno check src/startup/cli/list.ts src/startup/cli/attach.ts
```

**Step 3: Commit**

```bash
git add src/startup/cli/list.ts src/startup/cli/attach.ts
git commit -m "refactor(cli): update list/attach with team/company terminology"
```

---

## Task 5: Update Tests - prospect → call

**Files:**
- Modify: `tests/e2e/delegation-flow.test.ts`
- Modify: `tests/e2e/poc-flow-e2e.test.ts`
- Modify: `tests/integration/env-vars.test.ts`
- Modify: `tests/integration/tmux-spawn.test.ts`

**Pattern replacements:**
1. `prospect surveyor` → `call designer`
2. `prospect miner` → `call engineer`
3. `prospect camp-boss` → `call cto`
4. `prospect <role>` → `call <mapped-role>`
5. `PAYDIRT_PROSPECT` assertions → `STARTUP_ROLE`

**Role mapping for tests:**
- surveyor → designer
- miner → engineer
- camp-boss → cto
- shift-boss → lead
- canary → qa
- assayer → reviewer
- pm → product

**Step 1: Update each test file**

**Step 2: Run affected tests**

```bash
deno test --allow-all tests/e2e/delegation-flow.test.ts
deno test --allow-all tests/integration/env-vars.test.ts
deno test --allow-all tests/integration/tmux-spawn.test.ts
```

**Step 3: Commit**

```bash
git add tests/
git commit -m "test: update tests to use call instead of prospect"
```

---

## Task 6: Update Tests - boss → company, stake → kickoff

**Files:**
- Modify: `tests/integration/tmux-spawn.test.ts` (boss tests)
- Modify: `tests/integration/poc-flow.test.ts` (boss tests)
- Modify: `tests/integration/stake.test.ts` (stake → kickoff)

**Pattern replacements:**
1. `boss start` → `company start`
2. `boss stop` → `company stop`
3. `boss status` → `company status`
4. `pd-boss` session → `startup-company`
5. `stake` command → `kickoff`
6. Test names and assertions

**Step 1: Update test files**

**Step 2: Run affected tests**

```bash
deno test --allow-all tests/integration/tmux-spawn.test.ts
deno test --allow-all tests/integration/poc-flow.test.ts
deno test --allow-all tests/integration/stake.test.ts
```

**Step 3: Commit**

```bash
git add tests/
git commit -m "test: update tests for company/kickoff/team terminology"
```

---

## Task 7: Update Tests - caravan → team

**Files:**
- Modify: `tests/e2e/delegation-flow.test.ts`
- Modify: `tests/integration/boomtown.test.ts`
- Modify: Any other files with "caravan" references

**Pattern replacements:**
1. `caravan` → `team`
2. `Caravan` → `Team`
3. `pd:caravan` → `st:team`

**Step 1: Find and replace**

```bash
grep -r "caravan" tests/ --include="*.ts"
```

**Step 2: Update files**

**Step 3: Run all tests**

```bash
deno test --allow-all src/ tests/
```

**Step 4: Commit**

```bash
git add tests/
git commit -m "test: rename caravan → team in tests"
```

---

## Task 8: Final Verification

**Step 1: Run full test suite**

```bash
deno test --allow-all src/ tests/
```

**Step 2: Verify all 15 previously failing tests pass**

Expected: 0 failures in integration tests

**Step 3: Run type check**

```bash
deno check startup.ts
```

**Step 4: Final commit and push**

```bash
git add -A
git commit -m "fix: all integration tests passing with new CLI structure"
bd sync
git push
```

---

## Success Criteria

1. All 77+ src/ unit tests pass
2. All 15 previously failing integration tests pass
3. CLI commands work:
   - `startup kickoff "task"` - creates team
   - `startup call <role> "task"` - spawns agent
   - `startup company start|stop|status` - daemon management
   - `startup list` - shows teams
   - `startup attach [team]` - attaches to session
4. Terminology consistent: team, company, startup-*
