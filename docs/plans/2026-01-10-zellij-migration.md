# Zellij Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace mprocs with zellij for Boomtown dashboard, enabling dynamic caravan pane addition without restart.

**Architecture:**
- Zellij session `paydirt-boomtown` with tabs for organization
- Control Room as permanent sidebar pane
- Camp Boss as main pane in first tab
- Each caravan gets a new tab with tmux attach
- Dynamic caravan addition via `zellij action new-tab`

**Tech Stack:** Zellij 0.43+, Deno/TypeScript, tmux (for agent sessions)

---

## Phase 1: Core Zellij Module

### Task 1.1: Create zellij types and interfaces

**Files:**
- Create: `src/paydirt/boomtown/zellij.ts`

**Step 1: Write the type definitions**

```typescript
// src/paydirt/boomtown/zellij.ts
/**
 * Zellij session manager for Paydirt Boomtown dashboard.
 * Replaces mprocs with dynamic pane management.
 */

export const BOOMTOWN_SESSION = 'paydirt-boomtown';

export interface ZellijPane {
  name: string;
  command: string;
  cwd?: string;
}

export interface ZellijTab {
  name: string;
  panes: ZellijPane[];
}

export interface ZellijLayout {
  tabs: ZellijTab[];
}
```

**Step 2: Commit**

```bash
git add src/paydirt/boomtown/zellij.ts
git commit -m "feat(zellij): add type definitions for zellij integration"
```

---

### Task 1.2: Create layout generator

**Files:**
- Modify: `src/paydirt/boomtown/zellij.ts`

**Step 1: Write the layout generation function**

Add to `zellij.ts`:

```typescript
/**
 * Generate zellij layout KDL for Boomtown.
 *
 * Layout structure:
 * - Tab "Control": Control Room (status) + Camp Boss side-by-side
 * - Tab per caravan: tmux attach to caravan session
 */
export function generateBoomtownLayout(
  controlRoomScript: string,
  campBossScript: string,
): string {
  return `layout {
    default_tab_template {
        pane size=1 borderless=true {
            plugin location="tab-bar"
        }
        children
        pane size=1 borderless=true {
            plugin location="status-bar"
        }
    }

    tab name="Control" focus=true {
        pane split_direction="vertical" {
            pane size="30%" name="Control Room" {
                command "bash"
                args "${controlRoomScript}"
            }
            pane name="Camp Boss" {
                command "bash"
                args "${campBossScript}"
            }
        }
    }
}
`;
}
```

**Step 2: Commit**

```bash
git add src/paydirt/boomtown/zellij.ts
git commit -m "feat(zellij): add layout generator for Boomtown"
```

---

### Task 1.3: Create session management functions

**Files:**
- Modify: `src/paydirt/boomtown/zellij.ts`

**Step 1: Write session check function**

```typescript
/**
 * Check if a zellij session exists.
 */
export async function sessionExists(sessionName: string): Promise<boolean> {
  const cmd = new Deno.Command('zellij', {
    args: ['list-sessions'],
    stdout: 'piped',
    stderr: 'null',
  });
  const result = await cmd.output();
  if (!result.success) return false;

  const output = new TextDecoder().decode(result.stdout);
  return output.includes(sessionName);
}

/**
 * Attach to existing zellij session.
 */
export async function attachSession(sessionName: string): Promise<void> {
  const cmd = new Deno.Command('zellij', {
    args: ['attach', sessionName],
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  await cmd.output();
}

/**
 * Create new zellij session with layout.
 */
export async function createSession(
  sessionName: string,
  layoutPath: string,
): Promise<boolean> {
  const cmd = new Deno.Command('zellij', {
    args: ['--session', sessionName, '--layout', layoutPath],
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const result = await cmd.output();
  return result.success;
}
```

**Step 2: Commit**

```bash
git add src/paydirt/boomtown/zellij.ts
git commit -m "feat(zellij): add session management functions"
```

---

### Task 1.4: Create dynamic pane addition

**Files:**
- Modify: `src/paydirt/boomtown/zellij.ts`

**Step 1: Write new-tab function for caravans**

```typescript
/**
 * Add a new caravan tab to running Boomtown session.
 * This is the key feature - dynamic caravan addition without restart.
 */
export async function addCaravanTab(
  caravanId: string,
  caravanName: string,
): Promise<boolean> {
  const sessionName = `paydirt-${caravanId}`;
  const tabName = `${caravanId.substring(0, 12)}: ${caravanName.substring(0, 20)}`;

  // Create tab that attaches to tmux session
  const cmd = new Deno.Command('zellij', {
    args: [
      '--session', BOOMTOWN_SESSION,
      'action', 'new-tab',
      '--name', tabName,
      '--', 'bash', '-c',
      `while true; do
        if tmux has-session -t ${sessionName} 2>/dev/null; then
          tmux attach -t ${sessionName}
          sleep 1
        else
          echo "Waiting for session ${sessionName}..."
          sleep 2
        fi
      done`,
    ],
    stdout: 'piped',
    stderr: 'piped',
  });

  const result = await cmd.output();
  return result.success;
}

/**
 * Remove a caravan tab from Boomtown.
 */
export async function removeCaravanTab(tabName: string): Promise<boolean> {
  const cmd = new Deno.Command('zellij', {
    args: [
      '--session', BOOMTOWN_SESSION,
      'action', 'go-to-tab-name', tabName,
    ],
    stdout: 'null',
    stderr: 'null',
  });
  await cmd.output();

  const closeCmd = new Deno.Command('zellij', {
    args: ['--session', BOOMTOWN_SESSION, 'action', 'close-tab'],
    stdout: 'null',
    stderr: 'null',
  });
  const result = await closeCmd.output();
  return result.success;
}
```

**Step 2: Commit**

```bash
git add src/paydirt/boomtown/zellij.ts
git commit -m "feat(zellij): add dynamic caravan tab management"
```

---

## Phase 2: Integration with Stake Command

### Task 2.1: Update stake to add caravan tab

**Files:**
- Modify: `src/paydirt/cli/stake.ts`

**Step 1: Import zellij module**

Add at top of `stake.ts`:

```typescript
import { addCaravanTab, BOOMTOWN_SESSION, sessionExists as zellijSessionExists } from '../boomtown/zellij.ts';
```

**Step 2: Add tab after creating tmux session**

Find the section after `createTmuxSession` succeeds (around line 175) and add:

```typescript
  // Notify Boomtown dashboard
  await notifyNewCaravan(claimId, task);

  // Add caravan tab to Boomtown if running
  if (await zellijSessionExists(BOOMTOWN_SESSION)) {
    const added = await addCaravanTab(claimId, caravanName);
    if (added) {
      console.log(`✓ Added to Boomtown dashboard`);
    }
  }
```

**Step 3: Commit**

```bash
git add src/paydirt/cli/stake.ts
git commit -m "feat(stake): auto-add caravan tab to Boomtown"
```

---

## Phase 3: Dashboard Launch

### Task 3.1: Create zellij dashboard launcher

**Files:**
- Create: `src/paydirt/boomtown/zellij-dashboard.ts`

**Step 1: Write the launcher**

```typescript
// src/paydirt/boomtown/zellij-dashboard.ts
/**
 * Zellij-based Boomtown dashboard launcher.
 */

import { findPaydirtPath } from './dashboard.ts';
import { generateCampBossScriptContent } from './camp-boss-pane.ts';
import { generateStatusScriptContent, DashboardCaravanInfo } from './mprocs.ts';
import {
  BOOMTOWN_SESSION,
  generateBoomtownLayout,
  sessionExists,
  attachSession,
  createSession,
  addCaravanTab,
} from './zellij.ts';

/**
 * List open caravans from bd.
 */
async function listCaravans(): Promise<DashboardCaravanInfo[]> {
  try {
    const cmd = new Deno.Command('bd', {
      args: ['list', '--label', 'pd:caravan', '--status', 'open', '--brief'],
      stdout: 'piped',
      stderr: 'null',
    });
    const result = await cmd.output();
    if (!result.success) return [];

    const output = new TextDecoder().decode(result.stdout);
    const lines = output.trim().split('\n').filter(l => l.trim());
    const caravans: DashboardCaravanInfo[] = [];

    for (const line of lines) {
      // Parse: "pd-xxx [P2] [task] open [pd:caravan] - Title"
      const match = line.match(/^(\S+)\s+.*\s+-\s+(.+)$/);
      if (match) {
        caravans.push({
          id: match[1],
          name: match[2],
          status: 'idle',
        });
      }
    }
    return caravans;
  } catch {
    return [];
  }
}

/**
 * Launch Boomtown with zellij.
 */
export async function launchZellijBoomtown(): Promise<void> {
  console.log('Launching Paydirt Boomtown (zellij)...');

  // Check if session already exists
  if (await sessionExists(BOOMTOWN_SESSION)) {
    console.log(`Session ${BOOMTOWN_SESSION} exists, attaching...`);
    await attachSession(BOOMTOWN_SESSION);
    return;
  }

  // Find paydirt binary
  let paydirtPath: string;
  try {
    paydirtPath = await findPaydirtPath();
  } catch (error) {
    console.error((error as Error).message);
    Deno.exit(1);
  }

  const projectRoot = Deno.cwd();
  const tempDir = await Deno.makeTempDir({ prefix: 'paydirt-zellij-' });

  // Write Control Room script
  const controlRoomScript = `${tempDir}/control-room.sh`;
  await Deno.writeTextFile(controlRoomScript, generateStatusScriptContent());
  await Deno.chmod(controlRoomScript, 0o755);

  // Write Camp Boss script
  const campBossScript = `${tempDir}/camp-boss.sh`;
  const campBossAgentPath = `${projectRoot}/prospects/camp-boss.md`;
  await Deno.writeTextFile(
    campBossScript,
    generateCampBossScriptContent(paydirtPath, campBossAgentPath, projectRoot),
  );
  await Deno.chmod(campBossScript, 0o755);

  // Write layout file
  const layoutPath = `${tempDir}/boomtown.kdl`;
  await Deno.writeTextFile(
    layoutPath,
    generateBoomtownLayout(controlRoomScript, campBossScript),
  );

  console.log('Creating zellij session...');

  // Create session - this will block until user exits
  const success = await createSession(BOOMTOWN_SESSION, layoutPath);

  // After session exits, add existing caravan tabs
  // Note: This happens when attaching to existing session
  const caravans = await listCaravans();
  for (const caravan of caravans) {
    await addCaravanTab(caravan.id, caravan.name);
  }

  if (!success) {
    console.error('Failed to create zellij session');
    Deno.exit(1);
  }

  // Cleanup temp files
  try {
    await Deno.remove(tempDir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}
```

**Step 2: Commit**

```bash
git add src/paydirt/boomtown/zellij-dashboard.ts
git commit -m "feat(zellij): add dashboard launcher"
```

---

### Task 3.2: Update CLI to use zellij dashboard

**Files:**
- Modify: `paydirt.ts` (main CLI)

**Step 1: Find boomtown command handler**

Look for the `boomtown` command case and update to use zellij:

```typescript
// In the boomtown command handler, replace:
// await launchBoomtown();
// with:
import { launchZellijBoomtown } from './src/paydirt/boomtown/zellij-dashboard.ts';
await launchZellijBoomtown();
```

**Step 2: Commit**

```bash
git add paydirt.ts
git commit -m "feat(cli): switch boomtown to use zellij"
```

---

## Phase 4: Update Control Room for Zellij

### Task 4.1: Update status script for zellij controls

**Files:**
- Modify: `src/paydirt/boomtown/mprocs.ts`

**Step 1: Update print_controls_panel function**

In `generateStatusScriptContent()`, find `print_controls_panel()` and update:

```typescript
print_controls_panel() {
  echo ""
  echo -e "\${FG} ╔══════════════════════════════════════════════════════════════════════╗"
  echo -e " ║  \${AMBER}◆ ZELLIJ CONTROLS\${FG}                                                    ║"
  echo -e " ╠════════════════════╦════════════════════╦════════════════════════════╣"
  echo -e " ║  [C-p] Pane Mode   ║  [C-t] Tab Mode    ║  [C-q] Exit Boomtown       ║"
  echo -e " ║  [←↑↓→] Navigate   ║  [n] New Tab       ║  [x] Close Tab             ║"
  echo -e " ╚════════════════════╩════════════════════╩════════════════════════════╝"
  echo -e "\${RESET}"
}
```

**Step 2: Commit**

```bash
git add src/paydirt/boomtown/mprocs.ts
git commit -m "feat(status): update controls panel for zellij"
```

---

## Phase 5: Testing & Verification

### Task 5.1: Manual test - basic launch

**Step 1: Compile and test**

```bash
deno compile --allow-all --output=paydirt paydirt.ts
./paydirt boomtown
```

**Expected:**
- Zellij session `paydirt-boomtown` created
- Control tab with Control Room (left) and Camp Boss (right)
- Can detach with Ctrl+o d

**Step 2: Test reattach**

```bash
./paydirt boomtown
```

**Expected:**
- Attaches to existing session (no new session created)

---

### Task 5.2: Manual test - dynamic caravan

**Step 1: Start Boomtown in one terminal**

```bash
./paydirt boomtown
```

**Step 2: In another terminal, create a caravan**

```bash
./paydirt stake "Test dynamic caravan"
```

**Expected:**
- Caravan created in bd with `pd:caravan` label
- tmux session `paydirt-pd-xxx` created
- New tab automatically added to Boomtown
- Tab shows the tmux session

---

### Task 5.3: Run existing tests

**Step 1: Run tests**

```bash
deno test --allow-all
```

**Step 2: Fix any failures**

Update tests that assume mprocs behavior if needed.

**Step 3: Commit fixes if any**

```bash
git add -A
git commit -m "test: update tests for zellij migration"
```

---

## Phase 6: Cleanup

### Task 6.1: Update exports

**Files:**
- Modify: `src/paydirt/boomtown/mod.ts`

**Step 1: Add zellij exports**

```typescript
export {
  BOOMTOWN_SESSION,
  sessionExists,
  attachSession,
  createSession,
  addCaravanTab,
  removeCaravanTab,
  generateBoomtownLayout,
} from './zellij.ts';

export { launchZellijBoomtown } from './zellij-dashboard.ts';
```

**Step 2: Commit**

```bash
git add src/paydirt/boomtown/mod.ts
git commit -m "feat(mod): export zellij functions"
```

---

### Task 6.2: Final commit and sync

**Step 1: Sync beads**

```bash
bd sync
```

**Step 2: Push**

```bash
git push
```

---

## Summary

After completing all tasks:

1. **Boomtown uses zellij** instead of mprocs
2. **Dynamic caravan tabs** - new caravans automatically appear
3. **Session persistence** - detach/attach without losing state
4. **Familiar controls** - standard zellij keybindings

### Key Commands

| Action | Command |
|--------|---------|
| Launch Boomtown | `./paydirt boomtown` |
| Detach | `Ctrl+o d` |
| New tab | `Ctrl+t n` |
| Close tab | `Ctrl+t x` |
| Switch tabs | `Ctrl+t ←/→` |
| Pane navigation | `Ctrl+p ←/→` |
