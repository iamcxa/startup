# Zellij UI Refactor Design

> **For Claude:** This is a design document. Use `superpowers:writing-plans` to create an implementation plan from this design.

**Goal:** Replace tmux-only UI with Zellij dashboard layer for dynamic tab/pane management while keeping tmux as persistence layer.

**Architecture:** Dual-layer system where Zellij provides the dashboard UI (can close/reopen without killing agents) and tmux provides persistence (agents continue running). Each zellij pane attaches to a tmux window.

**Tech Stack:** Zellij 0.43+, tmux, Deno/TypeScript, bash hooks

---

## 1. Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                    Zellij Session: startup                      │
│  (Dashboard Layer - can close/reopen without affecting agents)  │
├────────────────────────────────────────────────────────────────┤
│  [CTO]  [Team-abc]  [Team-xyz]  ...                            │
│                                                                 │
│  Each pane runs: tmux attach -t session:window                  │
└────────────────────────────────────────────────────────────────┘
                              │
                              │ tmux attach -t session:window
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                 Tmux (Persistence Layer)                        │
│  Claude agents run here, survive zellij close/crash             │
├────────────────────────────────────────────────────────────────┤
│  startup-company          startup-abc         startup-xyz       │
│  └── window: cto          ├── window: lead    └── window: eng   │
│                           ├── window: eng                       │
│                           └── window: product                   │
└────────────────────────────────────────────────────────────────┘
```

### Core Principles

- **Zellij** = Pure display layer (dashboard)
- **Tmux** = Persistence layer (agents)
- **Hook** = Event-driven UI updates

---

## 2. Session Structure

### Single Unified Zellij Session

```
Session: startup
├── Tab: CTO (always present)
│   └── Pane: tmux attach -t startup-company:cto
│
├── Tab: team-{id} (dynamically added per kickoff)
│   ├── Pane: tmux attach -t startup-{id}:lead
│   ├── Pane: tmux attach -t startup-{id}:engineer  (dynamic)
│   └── Pane: tmux attach -t startup-{id}:product   (dynamic)
│
└── Tab: team-{id2} ...
```

### Tab Naming Convention

| Tab | Name Format | Example |
|-----|-------------|---------|
| CTO | `CTO` | `CTO` |
| Team | `team-{short-id}` | `team-abc123` |

### Pane Layout Within Team Tab

Vertical stack (each role gets full width):

```
┌─────────────────────┐
│        Lead         │
├─────────────────────┤
│      Engineer       │
├─────────────────────┤
│      Product        │  ← Focus switches here when HUMAN_REQUIRED
└─────────────────────┘
```

---

## 3. Role Lifecycle

| Role | Lifecycle | Notes |
|------|-----------|-------|
| CTO | Persistent | Human interface, always running |
| Lead | Per-project | Exits after task breakdown complete |
| Designer | Per-design | Exits after design complete |
| Engineer | Ephemeral (respawn) | Exits when blocked or complete, respawns after decision |
| Product | Very short (process & exit) | Exits immediately after answering decision |

### Pane Lifecycle Strategy

**Keep pane waiting for reconnect** (Option A):

```bash
while true; do
  tmux attach -t startup-{id}:{role} 2>/dev/null || {
    echo "Agent exited, waiting for respawn..."
    sleep 2
  }
done
```

Benefits:
- History preserved across respawns
- Automatic reconnection when agent respawns
- Visual continuity

---

## 4. Dynamic Behaviors

### 4.1 New Team Creation (kickoff)

```
CTO executes: startup kickoff "Build auth"
    │
    ▼
┌─────────────────────────────────────┐
│ 1. Create bd issue (st:team label)  │
│ 2. Create tmux session startup-{id} │
│ 3. Start first role (Lead/Designer) │
└─────────────────────────────────────┘
    │
    ▼ PostToolUse Hook detects kickoff
    │
┌─────────────────────────────────────┐
│ Hook executes:                      │
│ 1. zellij action new-tab --name     │
│ 2. Create pane attaching to tmux    │
└─────────────────────────────────────┘
```

### 4.2 New Role Joins Team (SPAWN)

```
SPAWN: engineer detected
    │
    ▼ PostToolUse Hook
    │
┌─────────────────────────────────────┐
│ 1. tmux new-window -t startup-{id}  │
│    -n engineer                      │
│ 2. Start Claude in that window      │
│ 3. zellij: add pane to team tab,    │
│    attach to new tmux window        │
└─────────────────────────────────────┘
```

### 4.3 Focus Switch on HUMAN_REQUIRED

```
Product needs human input (low/none confidence)
    │
    ▼
┌─────────────────────────────────────────────┐
│ Product writes bd comment:                  │
│ "HUMAN_REQUIRED: <question>"                │
└─────────────────────────────────────────────┘
    │
    ▼ PostToolUse Hook detects HUMAN_REQUIRED
    │
┌─────────────────────────────────────────────┐
│ 1. zellij action go-to-tab-name team-{id}   │
│ 2. zellij action focus-pane (product pane)  │
│ 3. Optional: system notification            │
└─────────────────────────────────────────────┘
```

---

## 5. Hook Trigger Points

Update `hooks/post-tool-use.sh` with new detection:

| Trigger | Hook Action |
|---------|-------------|
| `startup kickoff ...` | Create new team tab |
| `bd comments add ... "SPAWN:..."` | Add pane to team tab |
| `bd comments add ... "HUMAN_REQUIRED:..."` | Focus switch to that pane |
| `bd close` on st:decision | Respawn engineer (existing) |

---

## 6. Implementation Components

### 6.1 Files to Modify/Create

```
src/startup/
├── boomtown/
│   ├── zellij.ts              # Modify: add pane management functions
│   ├── zellij-dashboard.ts    # Modify: new launch logic
│   └── zellij-layout.kdl      # New: initial layout (CTO tab only)
│
├── cli/
│   ├── stake.ts               # Modify: notify zellij on kickoff
│   └── prospect.ts            # Modify: add pane when role starts
│
hooks/
└── post-tool-use.sh           # Modify: add focus switch logic
```

### 6.2 New Zellij Action Functions

```typescript
// src/startup/boomtown/zellij.ts

// Add new Team Tab
async function addTeamTab(teamId: string, teamName: string): Promise<boolean>

// Add Role Pane to Team Tab
async function addRolePaneToTeam(teamId: string, role: string): Promise<boolean>

// Focus specific Team + Role
async function focusTeamRole(teamId: string, role: string): Promise<boolean>

// List all Team Tabs
async function listTeamTabs(): Promise<string[]>

// Get pane ID for role in team
async function getPaneId(teamId: string, role: string): Promise<string | null>
```

### 6.3 Hook Logic Additions

```bash
# hooks/post-tool-use.sh additions

# 1. kickoff → Add Team Tab
if echo "$TOOL_INPUT" | grep -qE "startup kickoff"; then
  TEAM_ID=$(extract_team_id_from_output)
  zellij action new-tab --name "team-${TEAM_ID:0:8}"
  # Create initial pane for first role
fi

# 2. SPAWN → Add Role Pane
if echo "$TOOL_INPUT" | grep -qE "SPAWN:"; then
  ROLE=$(extract_role)
  TEAM_ID=$STARTUP_BD
  # Add pane to corresponding team tab
fi

# 3. HUMAN_REQUIRED → Focus Switch
if echo "$TOOL_INPUT" | grep -qE "HUMAN_REQUIRED:"; then
  TEAM_ID=$STARTUP_BD
  zellij action go-to-tab-name "team-${TEAM_ID:0:8}"
  # Focus the product pane
fi
```

---

## 7. Zellij Commands Reference

```bash
# Session management
zellij -s startup -l layout.kdl     # Create session with layout
zellij attach startup               # Attach to existing session
zellij list-sessions                # List sessions

# Tab management (run from within session or with --session)
zellij action new-tab --name "team-abc"
zellij action go-to-tab-name "team-abc"
zellij action close-tab

# Pane management
zellij action new-pane --direction down
zellij action focus-next-pane
zellij action write-chars "command"
zellij action write 13              # Enter key

# From outside session
zellij --session startup action new-tab --name "team-abc"
```

---

## 8. Migration Path

### Phase 1: Core Zellij Module
- Update `zellij.ts` with new functions
- Create initial layout KDL

### Phase 2: Dashboard Launch
- Update `zellij-dashboard.ts` to use new layout
- CTO tab only on initial launch

### Phase 3: Hook Integration
- Update `post-tool-use.sh` for dynamic tab/pane creation
- Add focus switch logic

### Phase 4: Testing
- Manual test: launch, kickoff, spawn, focus switch
- Integration tests for hook triggers

---

## 9. Success Criteria

- [ ] `startup boomtown` launches zellij with CTO tab
- [ ] `startup kickoff` creates new team tab dynamically
- [ ] `SPAWN: engineer` adds pane to team tab
- [ ] `HUMAN_REQUIRED` triggers focus switch
- [ ] Closing zellij doesn't kill running agents
- [ ] Reopening zellij reconnects to all running agents
- [ ] Panes auto-reconnect after agent respawn
