# Paydirt POC Phase 2: Full Automation & Boomtown Integration

## Goal

Enable fully automated agent delegation via Claude Code hooks, with real-time visualization in Boomtown dashboard.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         BOOMTOWN (mprocs TUI)                           │
├─────────────┬─────────────┬─────────────────────────────────────────────┤
│ Control Room│ Camp Boss   │  Caravan Panes (per tmux session)           │
│ (status)    │ (human UI)  │  ┌─────────┬─────────┬─────────┐           │
│             │             │  │Trail Boss│Surveyor │ Miner   │ ← tmux    │
│             │             │  │ (window) │(window) │(window) │   windows │
└─────────────┴─────────────┴──┴─────────┴─────────┴─────────┴───────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    │         tmux session: paydirt-pd-xxx  │
                    │         (one caravan = one session)    │
                    └───────────────────────────────────────┘
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              │                         │                         │
              ▼                         ▼                         ▼
    ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
    │   Claude Code   │      │   Claude Code   │      │   Claude Code   │
    │   (Trail Boss)  │      │   (Surveyor)    │      │   (Miner)       │
    │                 │      │                 │      │                 │
    │ PostToolUse Hook│      │ PostToolUse Hook│      │ PostToolUse Hook│
    └────────┬────────┘      └────────┬────────┘      └────────┬────────┘
             │                        │                        │
             │ bd comments add        │ bd comments add        │
             │ "SPAWN: surveyor"      │ "OUTPUT: ..."          │
             ▼                        ▼                        ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │                     bd CLI (Message Bus)                            │
    │                     Issue: pd-xxx (Caravan)                         │
    │  Comments: QUESTION → ANSWER → SPAWN → OUTPUT → PROGRESS            │
    └─────────────────────────────────────────────────────────────────────┘
```

## Core Flow

1. **Trail Boss** writes `SPAWN: surveyor --task "Design auth"`
2. **PostToolUse Hook** detects `bd comments add` + SPAWN prefix
3. **Hook** executes `paydirt prospect surveyor --claim pd-xxx --background`
4. **prospect** command uses `tmux new-window` to add Surveyor to same session
5. **Boomtown** automatically shows new window (attached to tmux session)

## Hook Integration

### Claude Code Hook Configuration

`.claude/settings.local.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "command": "hooks/post-tool-use.sh"
      }
    ]
  }
}
```

### Environment Variables

| Variable | Source | Purpose |
|----------|--------|---------|
| `PAYDIRT_CLAIM` | Set at Claude launch | Identify caravan |
| `PAYDIRT_BIN` | Set at Claude launch | paydirt executable path |
| `PAYDIRT_ROLE` | Set at Claude launch | Current role (for logging) |
| `CLAUDE_TOOL_NAME` | Provided by Claude Code | Check if Bash tool |
| `CLAUDE_TOOL_OUTPUT` | Provided by Claude Code | Parse bd comments content |

### Updated Hook Logic

`hooks/post-tool-use.sh`:

```bash
#!/bin/bash
# PostToolUse hook - automatic delegation

# Only process in Paydirt context
[ -z "$PAYDIRT_CLAIM" ] && exit 0
[ -z "$PAYDIRT_BIN" ] && exit 0

# Only process Bash tool
[ "$CLAUDE_TOOL_NAME" != "Bash" ] && exit 0

# Read tool output from stdin
TOOL_OUTPUT=$(cat)

# Check if this is a bd comments add command
echo "$TOOL_OUTPUT" | grep -q "bd comments add" || exit 0

# Extract comment content
COMMENT=$(echo "$TOOL_OUTPUT" | grep -oP '(?<=bd comments add [^ ]+ ")[^"]+' || true)
[ -z "$COMMENT" ] && exit 0

# Get prefix
PREFIX=$(echo "$COMMENT" | cut -d: -f1)
CONTENT=$(echo "$COMMENT" | sed 's/^[^:]*: *//')

case "$PREFIX" in
  SPAWN)
    ROLE=$(echo "$CONTENT" | cut -d' ' -f1)
    TASK=$(echo "$CONTENT" | grep -oP '(?<=--task ")[^"]+' || echo "")
    TARGET_CLAIM=$(echo "$CONTENT" | grep -oP '(?<=--claim )\S+' || echo "")

    if [ "$ROLE" = "trail-boss" ]; then
      # Camp Boss creates new caravan
      "$PAYDIRT_BIN" stake "$TASK"
    elif [ -n "$TARGET_CLAIM" ]; then
      # Add agent to specified caravan
      "$PAYDIRT_BIN" prospect "$ROLE" --claim "$TARGET_CLAIM" --task "$TASK" --background
    else
      # Add agent to same caravan
      "$PAYDIRT_BIN" prospect "$ROLE" --claim "$PAYDIRT_CLAIM" --task "$TASK" --background
    fi
    ;;
  QUESTION)
    "$PAYDIRT_BIN" prospect claim-agent --claim "$PAYDIRT_CLAIM" --background
    ;;
esac

exit 0
```

### buildClaudeCommand Environment Injection

```typescript
// src/paydirt/claude/command.ts
export function buildClaudeCommand(options: ClaudeCommandOptions): string {
  const env = [
    `PAYDIRT_CLAIM=${options.claimId}`,
    `PAYDIRT_BIN=${options.paydirtBinPath}`,
    `PAYDIRT_ROLE=${options.role}`,
  ].join(' ');

  return `${env} claude --prompt "..." --allowedTools "Bash,Read,..." ...`;
}
```

## Boomtown Integration

### Caravan Pane Behavior

Direct tmux attach for real-time agent visibility:

```yaml
# mprocs.yaml - Caravan pane config
"▶ pd-abc123":
  shell: "tmux attach -t paydirt-pd-abc123"
```

### User Experience in Boomtown

```
┌─ mprocs ─────────────────────────────────────────────────────────────────┐
│ ◆ CONTROL ROOM  │                                                        │
│ ⛺ CAMP BOSS    │  ┌─ tmux: paydirt-pd-abc123 ─────────────────────────┐ │
│ ▶ pd-abc123  ←──┼──│ [0:trail-boss] [1:surveyor] [2:miner*]           │ │
│                 │  │                                                   │ │
│                 │  │  (Currently showing miner's Claude Code UI)       │ │
│                 │  │                                                   │ │
│                 │  │  > Implementing authentication module...          │ │
│                 │  │                                                   │ │
│                 │  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### tmux Window Navigation

- `Ctrl+b n` - Next window (next agent)
- `Ctrl+b p` - Previous window
- `Ctrl+b 0/1/2` - Jump to specific window

### Update Mechanisms

| Scenario | Mechanism | UX |
|----------|-----------|-----|
| New agent in same caravan | tmux new-window | Instant, no flicker |
| New caravan | mprocs hot reload | Requires restart, can be smooth |

### New Caravan Notification

Control Room displays notification when new caravan detected:

```
╔══════════════════════════════════════╗
║  ⚠ NEW CARAVAN DETECTED              ║
║  pd-xyz789: "Build payment system"   ║
║  Press [r] in mprocs to reload       ║
╚══════════════════════════════════════╝
```

## Camp Boss Delegation

### Camp Boss Role

```
User ──dialog──▶ Camp Boss (Claude) ──SPAWN──▶ New Caravan / Agent
                     │
                     ├─ "Help me build authentication"
                     │
                     ▼
              bd comments add pd-boss-log "SPAWN: trail-boss --task \"Build auth\""
                     │
                     ▼ (PostToolUse Hook)
                     │
              paydirt stake "Build auth system"
                     │
                     ▼
              New caravan paydirt-pd-xxx created
              Boomtown shows "NEW CARAVAN DETECTED"
```

### Camp Boss Delegation Modes

| Command | Effect |
|---------|--------|
| `SPAWN: trail-boss --task "..."` | Create **new caravan**, launch Trail Boss |
| `SPAWN: surveyor --task "..." --claim pd-xxx` | Add agent to **existing caravan** |

### Camp Boss Command Log

```bash
# Camp Boss creates dedicated issue at startup
bd create --title "Camp Boss Command Log" --type epic --label pd:camp-boss
# ID: pd-boss-log

# All Camp Boss SPAWN commands logged here
bd comments add pd-boss-log "SPAWN: trail-boss --task \"Build auth\""
```

## Implementation Plan

### Files to Modify/Create

| File | Change |
|------|--------|
| `hooks/post-tool-use.sh` | Extend for Camp Boss, --claim parameter |
| `src/paydirt/claude/command.ts` | Inject PAYDIRT_* environment variables |
| `src/paydirt/cli/boss.ts` | Create pd-boss-log issue at startup |
| `src/paydirt/boomtown/mprocs.ts` | Caravan pane uses direct tmux attach |
| `src/paydirt/boomtown/camp-boss-pane.ts` | Ensure Camp Boss has correct hook setup |
| `.claude/settings.local.json` | Register PostToolUse hook |
| `tests/integration/hook-spawn.test.ts` | Add hook auto-spawn tests |
| `tests/e2e/camp-boss-delegation.test.ts` | Add Camp Boss delegation tests |

### Implementation Phases

```
Phase 1: Hook Environment Variables
├── Modify buildClaudeCommand to inject PAYDIRT_* env vars
└── Test: prospect-launched Claude has correct env vars

Phase 2: Hook Auto-Delegation
├── Update post-tool-use.sh for full dispatch
├── Create .claude/settings.local.json to register hook
└── Test: SPAWN comment auto-creates tmux window

Phase 3: Camp Boss Integration
├── boss start creates pd-boss-log issue
├── Camp Boss Claude configured with correct hook
└── Test: Camp Boss SPAWN trail-boss creates new caravan

Phase 4: Boomtown Visualization
├── Caravan pane changed to tmux attach
├── Control Room shows new caravan notification
└── Test: Manual E2E flow verification
```

## Success Criteria

- [ ] Chat with Camp Boss in Boomtown
- [ ] Camp Boss SPAWN trail-boss → New caravan auto-created
- [ ] Trail Boss SPAWN surveyor → Surveyor auto-appears in tmux
- [ ] Surveyor SPAWN miner → Miner auto-appears
- [ ] All communication recorded in bd comments
- [ ] Press [r] to reload, Boomtown shows new caravan pane

## Testing

### Manual E2E Test Flow

```bash
# ===== Phase 1: Launch Boomtown =====
deno run --allow-all paydirt.ts boomtown

# ===== Phase 2: Open another terminal, create caravan =====
deno run --allow-all paydirt.ts stake "Build user authentication"
# Observe: Boomtown shows "NEW CARAVAN DETECTED"
# Action: Press [r] in mprocs to reload

# ===== Phase 3: Trigger delegation in Trail Boss =====
# Trail Boss (Claude) executes:
bd comments add $PAYDIRT_CLAIM "SPAWN: surveyor --task \"Design OAuth2 flow\""

# Observe: tmux status shows [1:surveyor]
# Verify: New window has Surveyor Claude running

# ===== Phase 4: Chain delegation =====
# Surveyor completes design and executes:
bd comments add $PAYDIRT_CLAIM "OUTPUT: design=docs/oauth-design.md"
bd comments add $PAYDIRT_CLAIM "SPAWN: miner --task \"Implement OAuth2 module\""

# Observe: tmux status shows [2:miner]

# ===== Phase 5: Verify communication history =====
bd comments $PAYDIRT_CLAIM
# Should see complete SPAWN → OUTPUT sequence
```

### Automated Integration Test

```typescript
// tests/integration/hook-spawn.test.ts
Deno.test({
  name: 'PostToolUse hook spawns agent on SPAWN comment',
  async fn() {
    const claimId = await createTestClaim('Hook Spawn Test');
    const sessionName = `paydirt-${claimId}`;

    try {
      // 1. Create initial session (simulate Trail Boss)
      await createTmuxSession(sessionName, 'trail-boss');

      // 2. Simulate hook trigger
      const env = {
        PAYDIRT_CLAIM: claimId,
        PAYDIRT_BIN: `${Deno.cwd()}/paydirt`,
      };

      const hookInput = `bd comments add ${claimId} "SPAWN: surveyor --task \\"Test task\\""`;

      await runHookScript(hookInput, env);

      // 3. Wait and verify new window
      await delay(2000);
      const windows = await listTmuxWindows(sessionName);

      assertEquals(windows.includes('surveyor'), true);

    } finally {
      await cleanupTmuxSession(sessionName);
      await closeClaim(claimId);
    }
  },
});
```
