# Zellij UI Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement dual-layer Zellij+Tmux UI with dynamic tabs/panes and auto focus-switch.

**Architecture:** Zellij as dashboard layer with CTO tab always present, team tabs added dynamically via hooks. Each pane runs `tmux attach` in a loop for persistence.

**Tech Stack:** Zellij 0.43+, tmux, Deno/TypeScript, bash

---

## Task 1: Update Zellij Types and Constants

**Files:**
- Modify: `src/startup/boomtown/zellij.ts:1-40`

**Step 1: Update constants**

Replace `BOOMTOWN_SESSION` and add new constants at top of file:

```typescript
// src/startup/boomtown/zellij.ts

/** Session name for the unified Startup dashboard */
export const STARTUP_SESSION = 'startup';

/** Legacy alias for backward compatibility */
export const BOOMTOWN_SESSION = STARTUP_SESSION;

/** Tmux session for CTO (company-level) */
export const CTO_TMUX_SESSION = 'startup-company';

/** Tab name for CTO */
export const CTO_TAB_NAME = 'CTO';
```

**Step 2: Commit**

```bash
git add src/startup/boomtown/zellij.ts
git commit -m "feat(zellij): update session constants for unified dashboard"
```

---

## Task 2: Add Team Tab Management Functions

**Files:**
- Modify: `src/startup/boomtown/zellij.ts`

**Step 1: Add addTeamTab function**

Add after `addCaravanTab` function (around line 270):

```typescript
/**
 * Add a new Team tab to the Startup dashboard.
 * Creates a tab with initial pane attaching to the team's tmux session.
 *
 * @param teamId - Team ID (e.g., "st-abc123")
 * @param teamName - Display name for the tab
 * @param initialRole - First role in the team (default: "lead")
 * @returns true if tab was added successfully
 */
export async function addTeamTab(
  teamId: string,
  teamName: string,
  initialRole: string = 'lead',
): Promise<boolean> {
  try {
    const tmuxSession = `startup-${teamId}`;
    const tabName = `team-${teamId.slice(0, 8)}`;

    // Create reconnecting attach script
    const attachScript = `while true; do tmux attach-session -t ${tmuxSession}:${initialRole} 2>/dev/null || (echo "Waiting for ${initialRole}..." && sleep 2); done`;

    // Create new tab
    const createCmd = new Deno.Command('zellij', {
      args: ['action', 'new-tab', '--name', tabName],
      stdout: 'piped',
      stderr: 'piped',
    });

    const createResult = await createCmd.output();
    if (!createResult.success) {
      return false;
    }

    // Write the attach command
    const writeCmd = new Deno.Command('zellij', {
      args: ['action', 'write-chars', attachScript],
      stdout: 'piped',
      stderr: 'piped',
    });
    await writeCmd.output();

    // Press Enter to execute
    const enterCmd = new Deno.Command('zellij', {
      args: ['action', 'write', '13'],
      stdout: 'piped',
      stderr: 'piped',
    });
    await enterCmd.output();

    return true;
  } catch {
    return false;
  }
}
```

**Step 2: Commit**

```bash
git add src/startup/boomtown/zellij.ts
git commit -m "feat(zellij): add addTeamTab function"
```

---

## Task 3: Add Role Pane Management Function

**Files:**
- Modify: `src/startup/boomtown/zellij.ts`

**Step 1: Add addRolePaneToTeam function**

Add after `addTeamTab`:

```typescript
/**
 * Add a new role pane to an existing team tab.
 * Splits the current pane vertically (stacked layout).
 *
 * @param teamId - Team ID
 * @param role - Role name (e.g., "engineer", "product")
 * @returns true if pane was added successfully
 */
export async function addRolePaneToTeam(
  teamId: string,
  role: string,
): Promise<boolean> {
  try {
    const tmuxSession = `startup-${teamId}`;
    const tabName = `team-${teamId.slice(0, 8)}`;

    // First, switch to the team tab
    const gotoCmd = new Deno.Command('zellij', {
      args: ['action', 'go-to-tab-name', tabName],
      stdout: 'piped',
      stderr: 'piped',
    });

    const gotoResult = await gotoCmd.output();
    if (!gotoResult.success) {
      // Tab doesn't exist, try creating it first
      return false;
    }

    // Create new pane (splits down by default - vertical stack)
    const newPaneCmd = new Deno.Command('zellij', {
      args: ['action', 'new-pane', '--direction', 'down'],
      stdout: 'piped',
      stderr: 'piped',
    });

    const paneResult = await newPaneCmd.output();
    if (!paneResult.success) {
      return false;
    }

    // Write attach command for the new role
    const attachScript = `while true; do tmux attach-session -t ${tmuxSession}:${role} 2>/dev/null || (echo "Waiting for ${role}..." && sleep 2); done`;

    const writeCmd = new Deno.Command('zellij', {
      args: ['action', 'write-chars', attachScript],
      stdout: 'piped',
      stderr: 'piped',
    });
    await writeCmd.output();

    // Press Enter
    const enterCmd = new Deno.Command('zellij', {
      args: ['action', 'write', '13'],
      stdout: 'piped',
      stderr: 'piped',
    });
    await enterCmd.output();

    return true;
  } catch {
    return false;
  }
}
```

**Step 2: Commit**

```bash
git add src/startup/boomtown/zellij.ts
git commit -m "feat(zellij): add addRolePaneToTeam function"
```

---

## Task 4: Add Focus Switch Function

**Files:**
- Modify: `src/startup/boomtown/zellij.ts`

**Step 1: Add focusTeamRole function**

Add after `addRolePaneToTeam`:

```typescript
/**
 * Focus on a specific role pane within a team tab.
 * Used when HUMAN_REQUIRED is detected.
 *
 * @param teamId - Team ID
 * @param _role - Role name (currently unused, focuses last pane)
 * @returns true if focus was switched successfully
 */
export async function focusTeamRole(
  teamId: string,
  _role: string,
): Promise<boolean> {
  try {
    const tabName = `team-${teamId.slice(0, 8)}`;

    // Switch to the team tab
    const gotoCmd = new Deno.Command('zellij', {
      args: ['action', 'go-to-tab-name', tabName],
      stdout: 'piped',
      stderr: 'piped',
    });

    const result = await gotoCmd.output();
    if (!result.success) {
      return false;
    }

    // Focus the last pane (most recently added, likely the one needing attention)
    // Note: Zellij doesn't have "focus pane by name", so we focus the bottom pane
    const focusCmd = new Deno.Command('zellij', {
      args: ['action', 'focus-next-pane'],
      stdout: 'piped',
      stderr: 'piped',
    });
    await focusCmd.output();

    return true;
  } catch {
    return false;
  }
}

/**
 * List all team tabs in the current session.
 * @returns Array of tab names starting with "team-"
 */
export async function listTeamTabs(): Promise<string[]> {
  // Note: Zellij doesn't have a direct "list tabs" action
  // This is a placeholder - in practice, we track tabs ourselves
  return [];
}
```

**Step 2: Commit**

```bash
git add src/startup/boomtown/zellij.ts
git commit -m "feat(zellij): add focusTeamRole function"
```

---

## Task 5: Create Initial Layout KDL

**Files:**
- Create: `src/startup/boomtown/startup-layout.kdl`

**Step 1: Write the KDL layout file**

```kdl
// src/startup/boomtown/startup-layout.kdl
// Initial layout for Startup dashboard - CTO tab only

layout {
    default_tab_template {
        pane size=1 borderless=true {
            plugin location="zellij:tab-bar"
        }
        children
        pane size=2 borderless=true {
            plugin location="zellij:status-bar"
        }
    }

    // CTO Tab - always present
    tab name="CTO" focus=true {
        pane size=1 borderless=true {
            plugin location="zellij:tab-bar"
        }
        pane name="CTO" {
            command "bash"
            args "-c" "while true; do tmux attach-session -t startup-company:cto 2>/dev/null || (echo 'Waiting for CTO session...' && sleep 2); done"
        }
        pane size=2 borderless=true {
            plugin location="zellij:status-bar"
        }
    }
}
```

**Step 2: Commit**

```bash
git add src/startup/boomtown/startup-layout.kdl
git commit -m "feat(zellij): add initial CTO-only layout KDL"
```

---

## Task 6: Update Dashboard Launcher

**Files:**
- Modify: `src/startup/boomtown/zellij-dashboard.ts`

**Step 1: Update launchZellijBoomtown function**

Replace the entire file with:

```typescript
// src/startup/boomtown/zellij-dashboard.ts
/**
 * Zellij-based Startup dashboard launcher.
 * Uses dual-layer architecture: Zellij (display) + Tmux (persistence).
 */

import {
  STARTUP_SESSION,
  sessionExists,
  attachSession,
  createSession,
} from './zellij.ts';

/**
 * Get the path to the startup-layout.kdl file.
 */
function getLayoutPath(): string {
  // Layout file is in the same directory as this module
  const moduleDir = new URL('.', import.meta.url).pathname;
  return `${moduleDir}startup-layout.kdl`;
}

/**
 * Launch Startup dashboard with zellij.
 *
 * Features:
 * - Creates zellij session with CTO tab
 * - Attaches to existing session if already running
 * - Team tabs added dynamically via hooks
 */
export async function launchZellijBoomtown(): Promise<void> {
  console.log('Launching Startup Dashboard (zellij)...');

  // Check if session already exists
  if (await sessionExists(STARTUP_SESSION)) {
    console.log(`Session ${STARTUP_SESSION} exists, attaching...`);
    await attachSession(STARTUP_SESSION);
    return;
  }

  // Get layout path
  const layoutPath = getLayoutPath();

  // Verify layout file exists
  try {
    await Deno.stat(layoutPath);
  } catch {
    console.error(`Layout file not found: ${layoutPath}`);
    console.error('Please ensure startup-layout.kdl exists in the boomtown directory.');
    Deno.exit(1);
  }

  console.log('Creating zellij session...');
  console.log(`Layout: ${layoutPath}`);

  // Create session - blocks until user exits
  const success = await createSession(STARTUP_SESSION, layoutPath);
  if (!success) {
    console.error('Failed to create zellij session');
    Deno.exit(1);
  }

  console.log('Startup dashboard session ended.');
}
```

**Step 2: Commit**

```bash
git add src/startup/boomtown/zellij-dashboard.ts
git commit -m "feat(zellij): update dashboard launcher for new layout"
```

---

## Task 7: Update Module Exports

**Files:**
- Modify: `src/startup/boomtown/mod.ts`

**Step 1: Add new exports**

Update the zellij exports section:

```typescript
// Zellij integration
export {
  addCaravanTab,
  addRolePaneToTeam,
  addTeamTab,
  attachSession,
  BOOMTOWN_SESSION,
  createSession,
  CTO_TAB_NAME,
  CTO_TMUX_SESSION,
  focusTeamRole,
  generateBoomtownLayout,
  listTeamTabs,
  removeCaravanTab,
  sessionExists,
  STARTUP_SESSION,
} from './zellij.ts';

export { launchZellijBoomtown } from './zellij-dashboard.ts';
```

**Step 2: Commit**

```bash
git add src/startup/boomtown/mod.ts
git commit -m "feat(mod): export new zellij functions"
```

---

## Task 8: Update Hook for Team Tab Creation

**Files:**
- Modify: `hooks/post-tool-use.sh`

**Step 1: Add ZELLIJ_SESSION variable at top**

Add after the existing environment variable comments (around line 10):

```bash
# Zellij session name for dashboard
ZELLIJ_SESSION="startup"
```

**Step 2: Add zellij helper function**

Add after the `run_cmd` function (around line 32):

```bash
# Helper to check if zellij session exists
zellij_session_exists() {
  zellij list-sessions 2>/dev/null | grep -q "^$1"
}

# Helper to add team tab to zellij (if session running)
add_team_tab() {
  local team_id="$1"
  local tab_name="team-${team_id:0:8}"
  local tmux_session="startup-${team_id}"

  if ! zellij_session_exists "$ZELLIJ_SESSION"; then
    return 0  # Silent success if zellij not running
  fi

  # Create new tab
  zellij --session "$ZELLIJ_SESSION" action new-tab --name "$tab_name" 2>/dev/null || return 1

  # Write attach command
  local attach_cmd="while true; do tmux attach-session -t ${tmux_session}:lead 2>/dev/null || (echo 'Waiting for lead...' && sleep 2); done"
  zellij --session "$ZELLIJ_SESSION" action write-chars "$attach_cmd" 2>/dev/null
  zellij --session "$ZELLIJ_SESSION" action write 13 2>/dev/null  # Enter

  return 0
}

# Helper to add role pane to team tab
add_role_pane() {
  local team_id="$1"
  local role="$2"
  local tab_name="team-${team_id:0:8}"
  local tmux_session="startup-${team_id}"

  if ! zellij_session_exists "$ZELLIJ_SESSION"; then
    return 0
  fi

  # Switch to team tab
  zellij --session "$ZELLIJ_SESSION" action go-to-tab-name "$tab_name" 2>/dev/null || return 1

  # Create new pane (splits down)
  zellij --session "$ZELLIJ_SESSION" action new-pane --direction down 2>/dev/null || return 1

  # Write attach command
  local attach_cmd="while true; do tmux attach-session -t ${tmux_session}:${role} 2>/dev/null || (echo 'Waiting for ${role}...' && sleep 2); done"
  zellij --session "$ZELLIJ_SESSION" action write-chars "$attach_cmd" 2>/dev/null
  zellij --session "$ZELLIJ_SESSION" action write 13 2>/dev/null

  return 0
}

# Helper to focus team role (for HUMAN_REQUIRED)
focus_team_role() {
  local team_id="$1"
  local tab_name="team-${team_id:0:8}"

  if ! zellij_session_exists "$ZELLIJ_SESSION"; then
    return 0
  fi

  # Switch to team tab
  zellij --session "$ZELLIJ_SESSION" action go-to-tab-name "$tab_name" 2>/dev/null
  # Focus moves to this tab automatically
}
```

**Step 3: Commit**

```bash
git add hooks/post-tool-use.sh
git commit -m "feat(hook): add zellij helper functions"
```

---

## Task 9: Hook Integration - Kickoff Detection

**Files:**
- Modify: `hooks/post-tool-use.sh`

**Step 1: Add kickoff detection after Decision Close Detection**

Add after the `bd close` detection block (around line 85):

```bash
# --- Kickoff Detection ---
# Detect startup kickoff -> add team tab to zellij
if echo "$TOOL_INPUT" | grep -qE "startup kickoff"; then
  # Extract team ID from output
  TOOL_OUTPUT="${CLAUDE_TOOL_OUTPUT:-}"
  TEAM_ID=$(echo "$TOOL_OUTPUT" | sed -n 's/.*Created team:[[:space:]]*\([^[:space:]]*\).*/\1/p' | head -1)

  if [ -n "$TEAM_ID" ]; then
    add_team_tab "$TEAM_ID"
  fi
fi
```

**Step 2: Commit**

```bash
git add hooks/post-tool-use.sh
git commit -m "feat(hook): add kickoff detection for team tab creation"
```

---

## Task 10: Hook Integration - SPAWN Role Pane

**Files:**
- Modify: `hooks/post-tool-use.sh`

**Step 1: Update SPAWN case to add pane**

In the SPAWN case (around line 98), add pane creation after the spawn command:

```bash
  SPAWN)
    # Parse: <role> [--task "<task>"] [--claim <claim>]
    ROLE=$(echo "$CONTENT" | awk '{print $1}')
    TASK=$(echo "$CONTENT" | sed -n 's/.*--task ["\]\{0,2\}\([^"\\]*\)["\]\{0,2\}.*/\1/p')
    TARGET_CLAIM=$(echo "$CONTENT" | sed -n 's/.*--claim \([^ ]*\).*/\1/p')

    [ -z "$ROLE" ] && exit 0

    if [ "$ROLE" = "trail-boss" ]; then
      # Company creates new team
      if [ -n "$TASK" ]; then
        run_cmd "$STARTUP_BIN" kickoff "$TASK"
      fi
    elif [ -n "$TARGET_CLAIM" ]; then
      # Add agent to specified team
      run_cmd "$STARTUP_BIN" call "$ROLE" --claim "$TARGET_CLAIM" --task "$TASK" --background
      # Add pane to zellij (runs in background)
      add_role_pane "$TARGET_CLAIM" "$ROLE" &
    elif [ -n "$STARTUP_BD" ]; then
      # Add agent to same team
      run_cmd "$STARTUP_BIN" call "$ROLE" --claim "$STARTUP_BD" --task "$TASK" --background
      # Add pane to zellij
      add_role_pane "$STARTUP_BD" "$ROLE" &
    fi
    ;;
```

**Step 2: Commit**

```bash
git add hooks/post-tool-use.sh
git commit -m "feat(hook): add role pane on SPAWN"
```

---

## Task 11: Hook Integration - HUMAN_REQUIRED Focus

**Files:**
- Modify: `hooks/post-tool-use.sh`

**Step 1: Add HUMAN_REQUIRED detection**

Add after the kickoff detection block:

```bash
# --- HUMAN_REQUIRED Detection ---
# Detect HUMAN_REQUIRED comment -> focus switch to that team/role
if echo "$TOOL_INPUT" | grep -qE "bd comments add.*HUMAN_REQUIRED:"; then
  if [ -n "$STARTUP_BD" ]; then
    focus_team_role "$STARTUP_BD"
  fi
fi
```

**Step 2: Commit**

```bash
git add hooks/post-tool-use.sh
git commit -m "feat(hook): add HUMAN_REQUIRED focus switch"
```

---

## Task 12: Update Product Agent for HUMAN_REQUIRED

**Files:**
- Modify: `.startup/agents/product.md`

**Step 1: Update low confidence handling**

Find the "For low/none confidence" section (around line 160) and update:

```markdown
#### For low/none confidence:

First, signal that human attention is needed:

```bash
bd comments add $STARTUP_BD "HUMAN_REQUIRED: [brief question summary]"
```

Then use AskUserQuestion to get human input:

```
AskUserQuestion: [Present the decision question with context]
...
```
```

**Step 2: Commit**

```bash
git add .startup/agents/product.md
git commit -m "docs(product): add HUMAN_REQUIRED signal for focus switch"
```

---

## Task 13: Integration Test - Zellij Functions

**Files:**
- Create: `tests/integration/zellij-ui.test.ts`

**Step 1: Write the test file**

```typescript
// tests/integration/zellij-ui.test.ts
/**
 * Integration tests for Zellij UI functions.
 * NOTE: Requires zellij to be installed.
 */

import { assertEquals } from '@std/assert';
import {
  STARTUP_SESSION,
  sessionExists,
  addTeamTab,
  addRolePaneToTeam,
  focusTeamRole,
} from '../../src/startup/boomtown/zellij.ts';

// Skip if zellij not installed
async function zellijInstalled(): Promise<boolean> {
  try {
    const cmd = new Deno.Command('zellij', { args: ['--version'], stdout: 'null', stderr: 'null' });
    const result = await cmd.output();
    return result.success;
  } catch {
    return false;
  }
}

Deno.test({
  name: 'sessionExists returns false for non-existent session',
  async fn() {
    if (!await zellijInstalled()) {
      console.log('Skipping: zellij not installed');
      return;
    }

    const exists = await sessionExists('nonexistent-session-xyz');
    assertEquals(exists, false);
  },
});

Deno.test({
  name: 'addTeamTab returns false when no zellij session',
  async fn() {
    if (!await zellijInstalled()) {
      console.log('Skipping: zellij not installed');
      return;
    }

    // This should fail gracefully when no session exists
    const result = await addTeamTab('test-team', 'Test Team');
    assertEquals(result, false);
  },
});

Deno.test({
  name: 'addRolePaneToTeam returns false when no zellij session',
  async fn() {
    if (!await zellijInstalled()) {
      console.log('Skipping: zellij not installed');
      return;
    }

    const result = await addRolePaneToTeam('test-team', 'engineer');
    assertEquals(result, false);
  },
});

Deno.test({
  name: 'focusTeamRole returns false when no zellij session',
  async fn() {
    if (!await zellijInstalled()) {
      console.log('Skipping: zellij not installed');
      return;
    }

    const result = await focusTeamRole('test-team', 'product');
    assertEquals(result, false);
  },
});
```

**Step 2: Run tests**

Run: `deno test --allow-all tests/integration/zellij-ui.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add tests/integration/zellij-ui.test.ts
git commit -m "test(zellij): add integration tests for UI functions"
```

---

## Task 14: Integration Test - Hook Zellij Functions

**Files:**
- Create: `tests/integration/hook-zellij.test.ts`

**Step 1: Write the test file**

```typescript
// tests/integration/hook-zellij.test.ts
/**
 * Tests for hook zellij integration.
 * Verifies that hook helpers work correctly.
 */

import { assertEquals, assertStringIncludes } from '@std/assert';

async function runHookWithInput(
  toolInput: string,
  env: Record<string, string>,
): Promise<{ stdout: string; stderr: string; success: boolean }> {
  const cmd = new Deno.Command('bash', {
    args: ['hooks/post-tool-use.sh'],
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'piped',
    env: {
      ...Deno.env.toObject(),
      ...env,
      STARTUP_HOOK_SYNC: '1',
      CLAUDE_TOOL_INPUT: toolInput,
    },
    cwd: Deno.cwd(),
  });

  const child = cmd.spawn();
  const writer = child.stdin.getWriter();
  await writer.close();

  const { stdout, stderr, success } = await child.output();
  return {
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
    success,
  };
}

Deno.test({
  name: 'hook zellij helpers exist in script',
  async fn() {
    // Read the hook file and verify functions exist
    const content = await Deno.readTextFile('hooks/post-tool-use.sh');

    assertStringIncludes(content, 'zellij_session_exists');
    assertStringIncludes(content, 'add_team_tab');
    assertStringIncludes(content, 'add_role_pane');
    assertStringIncludes(content, 'focus_team_role');
  },
});

Deno.test({
  name: 'hook detects HUMAN_REQUIRED',
  async fn() {
    const result = await runHookWithInput(
      'bd comments add st-123 "HUMAN_REQUIRED: Which database should we use?"',
      {
        STARTUP_BIN: 'echo',
        STARTUP_BD: 'st-123',
      },
    );

    // Hook should succeed (zellij not running is OK)
    assertEquals(result.success, true);
  },
});
```

**Step 2: Run tests**

Run: `deno test --allow-all tests/integration/hook-zellij.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add tests/integration/hook-zellij.test.ts
git commit -m "test(hook): add zellij integration tests"
```

---

## Task 15: Run Full Test Suite

**Step 1: Run all tests**

```bash
deno test --allow-all
```

Expected: All tests pass (may have some ignored e2e tests)

**Step 2: Fix any failures**

If tests fail, debug and fix before proceeding.

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: address test failures"
```

---

## Task 16: Manual Verification

**Step 1: Ensure CTO tmux session exists**

```bash
# Create CTO session if not exists
tmux has-session -t startup-company 2>/dev/null || \
  tmux new-session -d -s startup-company -n cto
```

**Step 2: Launch dashboard**

```bash
deno run --allow-all startup.ts boomtown
```

Expected:
- Zellij session "startup" created
- CTO tab visible
- Pane shows "Waiting for CTO session..." or attaches to tmux

**Step 3: Test team tab creation (in another terminal)**

```bash
# Create a test team
deno run --allow-all startup.ts kickoff "Test zellij integration"
```

Expected:
- New tab appears in zellij dashboard
- Tab shows the team session

**Step 4: Detach and verify persistence**

Press `Ctrl+o d` to detach from zellij.

```bash
# Verify tmux sessions still running
tmux list-sessions
```

Expected: Tmux sessions still exist

**Step 5: Reattach**

```bash
deno run --allow-all startup.ts boomtown
```

Expected: Reattaches to existing session with all tabs

---

## Task 17: Final Sync and Push

**Step 1: Sync beads**

```bash
bd sync
```

**Step 2: Push to remote**

```bash
git push
```

---

## Summary

After completing all tasks:

1. **Zellij dashboard** launches with CTO tab
2. **Team tabs** created dynamically via hook
3. **Role panes** added when SPAWN detected
4. **Focus switch** on HUMAN_REQUIRED
5. **Persistence** - agents survive zellij close
6. **Tests** verify all functions work

### Key Files Modified

| File | Changes |
|------|---------|
| `src/startup/boomtown/zellij.ts` | New functions: addTeamTab, addRolePaneToTeam, focusTeamRole |
| `src/startup/boomtown/zellij-dashboard.ts` | Simplified launcher using KDL layout |
| `src/startup/boomtown/startup-layout.kdl` | New initial layout file |
| `src/startup/boomtown/mod.ts` | Export new functions |
| `hooks/post-tool-use.sh` | Zellij helpers and integration |
| `.startup/agents/product.md` | HUMAN_REQUIRED signal |
| `tests/integration/zellij-ui.test.ts` | New test file |
| `tests/integration/hook-zellij.test.ts` | New test file |
