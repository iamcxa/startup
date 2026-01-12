---
name: startup-status
description: Comprehensive status report for Startup multi-agent system. Shows bd stats, active tmux sessions, blocked issues, Decision Ledger history, and agent activity.
allowed-tools: Read, Bash, mcp__beads__*
---

# Startup Status Report

Generate a comprehensive status report for the Startup multi-agent orchestration system.

## When to Use

- When human asks "status", "what's happening", "project status", "現況"
- When CTO needs to report overall system state
- When debugging agent coordination issues
- At the start of a CTO session

## Status Report Sections

### 1. bd Issue Statistics

```bash
bd stats
```

Reports:
- Total issues
- Open / In Progress / Closed / Blocked / Ready counts
- Average lead time

### 2. Active tmux Sessions (Running Agents)

```bash
# List all startup-related tmux sessions
tmux list-sessions -F "#{session_name}|#{session_windows}|#{session_created}" 2>/dev/null | grep -E "^(startup|paydirt|st-)" || echo "No active sessions"
```

Parse output to show:
- Session name (contains claim ID)
- Number of windows (agents in session)
- Creation time

### 3. In-Progress Work

```bash
bd list --status in_progress --limit 10
```

Shows what's actively being worked on.

### 4. Blocked Issues

```bash
bd blocked
```

Shows issues waiting on dependencies with what's blocking them.

### 5. Ready to Work

```bash
bd ready --limit 5
```

Shows issues with no blockers that can be picked up.

### 6. Decision Ledger History (Recent Decisions)

```bash
# Find Decision Ledger
LEDGER=$(bd list --label st:ledger --type epic --limit 1 --brief 2>/dev/null | head -1 | awk '{print $1}')

if [ -n "$LEDGER" ]; then
  echo "Recent decisions from $LEDGER:"
  bd comments "$LEDGER" 2>/dev/null | grep "^DECISION" | tail -5
else
  echo "No Decision Ledger found"
fi
```

### 7. Recent Activity (Git Commits)

```bash
git log --oneline -5 --format="%h %s (%cr)"
```

## Output Format

```
╭────────────────────────────────────────────────────────────────╮
│                    STARTUP STATUS REPORT                       │
│                    ━━━━━━━━━━━━━━━━━━━━━━                       │
│                    [timestamp]                                 │
╰────────────────────────────────────────────────────────────────╯

📊 Issue Statistics
├── Total: XXX
├── Open: XX | In Progress: XX | Closed: XXX
├── Blocked: X | Ready: XX
└── Avg Lead Time: X.X hours

🖥️  Active Sessions (Running Agents)
├── paydirt-st-xxx: 2 windows (cto, engineer)
├── paydirt-st-yyy: 1 window (qa)
└── Total: X sessions, Y agents

⏳ In Progress (X)
├── st-xxx: [title] (assignee)
└── st-yyy: [title] (assignee)

🚧 Blocked (X)
├── st-aaa: [title]
│   └── blocked by: st-bbb (open)
└── st-ccc: [title]
    └── blocked by: st-ddd (in_progress)

✅ Ready to Work (top 5)
├── st-111: [title] (P2)
├── st-222: [title] (P2)
└── ... X more

📋 Recent Decisions
├── DECISION: q=[...], a=[...], confidence=high
└── DECISION: q=[...], a=[...], confidence=human

📝 Recent Commits
├── abc1234 feat: add auth (2 hours ago)
└── def5678 fix: login bug (3 hours ago)

╰────────────────────────────────────────────────────────────────╯
```

## Full Status Script

Run all checks and format the report:

```bash
#!/bin/bash
# Startup Status Report

echo "╭────────────────────────────────────────────────────────────────╮"
echo "│                    STARTUP STATUS REPORT                       │"
echo "│                    ━━━━━━━━━━━━━━━━━━━━━━                       │"
echo "│                    $(date '+%Y-%m-%d %H:%M:%S')                 │"
echo "╰────────────────────────────────────────────────────────────────╯"
echo ""

# 1. bd stats
echo "📊 Issue Statistics"
STATS=$(bd stats --json 2>/dev/null)
if [ -n "$STATS" ]; then
  TOTAL=$(echo "$STATS" | jq -r '.total_issues // 0')
  OPEN=$(echo "$STATS" | jq -r '.open_issues // 0')
  IN_PROG=$(echo "$STATS" | jq -r '.in_progress_issues // 0')
  CLOSED=$(echo "$STATS" | jq -r '.closed_issues // 0')
  BLOCKED=$(echo "$STATS" | jq -r '.blocked_issues // 0')
  READY=$(echo "$STATS" | jq -r '.ready_issues // 0')
  LEAD=$(echo "$STATS" | jq -r '.average_lead_time_hours // 0' | xargs printf "%.1f")
  echo "├── Total: $TOTAL"
  echo "├── Open: $OPEN | In Progress: $IN_PROG | Closed: $CLOSED"
  echo "├── Blocked: $BLOCKED | Ready: $READY"
  echo "└── Avg Lead Time: ${LEAD} hours"
else
  echo "└── (bd stats unavailable)"
fi
echo ""

# 2. tmux sessions
echo "🖥️  Active Sessions (Running Agents)"
SESSIONS=$(tmux list-sessions -F "#{session_name}:#{session_windows}" 2>/dev/null | grep -E "^(startup|paydirt|st-)" || true)
if [ -n "$SESSIONS" ]; then
  TOTAL_SESSIONS=0
  TOTAL_WINDOWS=0
  echo "$SESSIONS" | while IFS=: read -r name windows; do
    echo "├── $name: $windows window(s)"
  done
  echo "└── Total: $(echo "$SESSIONS" | wc -l | tr -d ' ') sessions"
else
  echo "└── No active sessions"
fi
echo ""

# 3. In Progress
echo "⏳ In Progress"
IN_PROGRESS=$(bd list --status in_progress --brief --limit 5 2>/dev/null || true)
if [ -n "$IN_PROGRESS" ]; then
  echo "$IN_PROGRESS" | head -5 | while read -r line; do
    echo "├── $line"
  done
else
  echo "└── (none)"
fi
echo ""

# 4. Blocked
echo "🚧 Blocked"
BLOCKED_LIST=$(bd blocked --brief 2>/dev/null || true)
if [ -n "$BLOCKED_LIST" ]; then
  echo "$BLOCKED_LIST" | head -5 | while read -r line; do
    echo "├── $line"
  done
else
  echo "└── (none)"
fi
echo ""

# 5. Ready
echo "✅ Ready to Work (top 5)"
READY_LIST=$(bd ready --brief --limit 5 2>/dev/null || true)
if [ -n "$READY_LIST" ]; then
  echo "$READY_LIST" | while read -r line; do
    echo "├── $line"
  done
else
  echo "└── (none)"
fi
echo ""

# 6. Recent Decisions
echo "📋 Recent Decisions"
LEDGER=$(bd list --label st:ledger --type epic --limit 1 --brief 2>/dev/null | head -1 | awk '{print $1}')
if [ -n "$LEDGER" ]; then
  DECISIONS=$(bd comments "$LEDGER" 2>/dev/null | grep "^DECISION" | tail -3)
  if [ -n "$DECISIONS" ]; then
    echo "$DECISIONS" | while read -r line; do
      echo "├── ${line:0:60}..."
    done
  else
    echo "└── No decisions recorded"
  fi
else
  echo "└── No Decision Ledger found"
fi
echo ""

# 7. Recent Commits
echo "📝 Recent Commits"
git log --oneline -3 --format="├── %h %s (%cr)" 2>/dev/null || echo "└── (git unavailable)"
echo ""
echo "╰────────────────────────────────────────────────────────────────╯"
```

## Quick Commands for CTO

| Command | Purpose |
|---------|---------|
| `bd stats` | Quick overview numbers |
| `bd ready` | What can be worked on |
| `bd blocked` | What's stuck |
| `bd list --status in_progress` | Active work |
| `tmux list-sessions` | Running agent sessions |
| `git log -5 --oneline` | Recent activity |
