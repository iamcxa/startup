# Testing Core Communication

This document describes how to test the Paydirt POC's event-driven communication system.

## Architecture Overview

```
┌─────────────┐    bd comments    ┌─────────────┐
│  Trail Boss │ ───────────────── │ Claim Agent │
└─────────────┘    (Message Bus)  └─────────────┘
       │                                 │
       │ SPAWN                           │ DECISION
       ▼                                 ▼
┌─────────────┐                  ┌─────────────┐
│  Surveyor   │                  │   Ledger    │
└─────────────┘                  └─────────────┘
```

**Message Prefixes:**

| Prefix | Direction | Purpose |
|--------|-----------|---------|
| `QUESTION` | Trail Boss → Claim Agent | Ask for decision |
| `ANSWER` | Claim Agent → Trail Boss | Provide decision |
| `SPAWN` | Any → Hook | Request agent spawn |
| `OUTPUT` | Agent → Trail Boss | Report work results |
| `PROGRESS` | Agent → Log | Status update |
| `CHECKPOINT` | Agent → Log | Phase completion |
| `DECISION` | Claim Agent → Ledger | Record decision |

## Automated Tests

Run all tests:

```bash
deno test --allow-all
```

### Test Files

| File | Coverage | Tests |
|------|----------|-------|
| `tests/unit/hook-script.test.ts` | Dispatcher logic, prefix parsing | 16 |
| `src/paydirt/ledger/mod.test.ts` | Ledger CRUD via bd CLI | 10 |
| `tests/integration/agent-communication.test.ts` | bd comments as Message Bus | 11 |
| `tests/integration/tmux-spawn.test.ts` | Tmux session/window creation | 10 |
| `tests/e2e/poc-flow-e2e.test.ts` | Complete event-driven flows | 6 |

### Run Specific Tests

```bash
# Unit tests only
deno test tests/unit/ --allow-all

# Integration tests only
deno test tests/integration/ --allow-all

# E2E tests only
deno test tests/e2e/ --allow-all

# Single test file
deno test tests/integration/agent-communication.test.ts --allow-all
```

## Manual Testing

### 1. Message Bus (bd comments)

Test that agents can communicate via bd comments:

```bash
# Create test claim
bd create --title "Test Communication" --type task
# Note the returned ID (e.g., pd-abc123)

export CLAIM=pd-abc123

# Write QUESTION (Trail Boss → Claim Agent)
bd comments add $CLAIM "QUESTION: Which database should we use?"

# Write ANSWER (Claim Agent → Trail Boss)
bd comments add $CLAIM "ANSWER: PostgreSQL for reliability and ACID compliance"

# Verify messages
bd comments $CLAIM

# Expected output includes both QUESTION and ANSWER entries

# Cleanup
bd close $CLAIM --reason "Test complete"
```

### 2. Dispatcher Logic

Test that comment prefixes trigger correct actions:

```bash
deno eval "
import { parseComment, getDispatchAction } from './src/paydirt/hooks/dispatcher.ts';

// Test QUESTION → spawns claim-agent
const q = parseComment('QUESTION: Which auth?');
console.log('QUESTION action:', getDispatchAction(q.prefix, q.content));

// Test SPAWN → spawns specified role
const s = parseComment('SPAWN: surveyor --task \"Design auth\"');
console.log('SPAWN action:', getDispatchAction(s.prefix, s.content));

// Test ANSWER → notifies
const a = parseComment('ANSWER: Use OAuth2');
console.log('ANSWER action:', getDispatchAction(a.prefix, a.content));
"
```

Expected output:
```
QUESTION action: { type: 'spawn', role: 'claim-agent' }
SPAWN action: { type: 'spawn', role: 'surveyor', task: 'Design auth' }
ANSWER action: { type: 'notify' }
```

### 3. SPAWN Command Parsing

Test that SPAWN commands are parsed correctly:

```bash
deno eval "
import { parseSpawnCommand } from './src/paydirt/hooks/dispatcher.ts';

const tests = [
  'surveyor --task \"Design the system\"',
  'miner --task \"Implement auth module\"',
  'shift-boss --task \"Plan phases\"',
];

for (const cmd of tests) {
  console.log(cmd, '->', parseSpawnCommand(cmd));
}
"
```

### 4. Tmux Session Creation

Test that prospect command creates tmux sessions:

```bash
# Dry run (shows command without executing)
deno run --allow-all paydirt.ts prospect surveyor \
  --claim test-tmux \
  --task "Test task" \
  --dry-run

# Actual creation (background mode)
deno run --allow-all paydirt.ts prospect surveyor \
  --claim test-tmux \
  --task "Test task" \
  --background

# Verify session exists
tmux has-session -t paydirt-test-tmux && echo "Session created!"

# List windows
tmux list-windows -t paydirt-test-tmux -F '#{window_name}'

# Cleanup
tmux kill-session -t paydirt-test-tmux
```

### 5. Decision Ledger

Test that decisions are recorded in the ledger:

```bash
# Find or create ledger
bd list --label pd:ledger --type epic --limit 1

# If not found, create it
bd create --title "Decision Ledger" --type epic --label pd:ledger

export LEDGER=pd-xxx  # Use actual ID

# Add a decision
bd comments add $LEDGER "DECISION caravan=test-caravan
Q: Which authentication provider?
A: OAuth2 with Google
Confidence: high
Source: user requirements
Reasoning: Users requested Google login"

# Retrieve decisions
bd comments $LEDGER | grep DECISION
```

### 6. Camp Boss Daemon

Test the boss daemon lifecycle:

```bash
# Start daemon
deno run --allow-all paydirt.ts boss start

# Check status
deno run --allow-all paydirt.ts boss status

# Verify tmux session
tmux has-session -t pd-boss && echo "Boss running!"

# Stop daemon
deno run --allow-all paydirt.ts boss stop

# Verify stopped
tmux has-session -t pd-boss || echo "Boss stopped!"
```

### 7. Full E2E Flow

Complete event-driven flow test:

```bash
# Step 1: Create caravan
bd create --title "E2E Test Caravan" --type task
export CLAIM=pd-xxx

# Step 2: Trail Boss asks question
bd comments add $CLAIM "QUESTION: Which authentication method should we use?"

# Step 3: Claim Agent answers
bd comments add $CLAIM "ANSWER: Use OAuth2 with Google - matches user requirements"

# Step 4: Trail Boss spawns Surveyor
bd comments add $CLAIM "SPAWN: surveyor --task \"Design OAuth2 integration\""

# Step 5: Surveyor reports output
bd comments add $CLAIM "OUTPUT: design=docs/plans/oauth-design.md files=3"

# Step 6: Progress updates
bd comments add $CLAIM "PROGRESS: 1/3 - Design phase started"
bd comments add $CLAIM "PROGRESS: 2/3 - Design complete"
bd comments add $CLAIM "CHECKPOINT: Design phase complete"

# Step 7: Verify full flow
bd comments $CLAIM

# Expected: All prefixes (QUESTION, ANSWER, SPAWN, OUTPUT, PROGRESS, CHECKPOINT)

# Cleanup
bd close $CLAIM --reason "E2E test complete"
```

## Verification Checklist

Before considering POC complete, verify:

- [ ] `deno test --allow-all` passes all 134 tests
- [ ] Manual Message Bus test shows comments recorded
- [ ] Dispatcher correctly maps prefixes to actions
- [ ] SPAWN command parsing extracts role and task
- [ ] `prospect` command creates tmux session with correct window name
- [ ] Decision Ledger records and retrieves DECISION entries
- [ ] Boss daemon starts, reports status, and stops cleanly
- [ ] Full E2E flow demonstrates complete communication chain

## Troubleshooting

### bd commands fail

```bash
# Check bd is initialized
bd stats

# If not initialized
bd init
```

### Tmux session not found

```bash
# List all sessions
tmux list-sessions

# Check for paydirt sessions specifically
tmux list-sessions | grep paydirt
```

### Tests fail with "sanitize" errors

Tests using tmux have `sanitizeOps: false` and `sanitizeResources: false`. If you see sanitization errors, ensure cleanup runs in `finally` blocks.

### Decision not appearing in history

The `bd comments` output format includes username: `[username] DECISION ...`. The filter uses `includes('DECISION')` not `startsWith()`.
