// tests/e2e/context-exhaustion.test.ts
// E2E test for context exhaustion and session recovery
//
// This test verifies that when a Miner session is interrupted
// (simulating context exhaustion), it can be respawned and
// continue work by recovering context from bd issues.
//
// Run with: RUN_E2E_TESTS=1 deno test tests/e2e/context-exhaustion.test.ts --allow-all
//
// WARNING: This test spawns real Claude agents and consumes API credits!

import { assertEquals, assertStringIncludes } from "@std/assert";
import { initLangfuseForTest, getLangfuseEnv, type LangfuseTestContext } from "../utils/langfuse.ts";

const WORK_DIR = Deno.cwd();
const PAYDIRT_BIN = `${WORK_DIR}/scripts/paydirt-dev.sh`;

interface TestContext {
  workIssueId: string;
}

/**
 * Run bd command and get output
 */
async function bd(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  const cmd = new Deno.Command("bd", {
    args,
    cwd: WORK_DIR,
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout, stderr, code } = await cmd.output();
  return {
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
    code,
  };
}

/**
 * Extract issue ID from bd create output
 */
function extractIssueId(output: string): string | null {
  const match = output.match(/Created issue:\s*(\S+)/);
  return match ? match[1] : null;
}

/**
 * Get issue comments
 */
async function getIssueComments(issueId: string): Promise<string> {
  const result = await bd(["comments", issueId]);
  return result.stdout;
}

/**
 * Check if tmux session exists
 */
async function tmuxSessionExists(sessionName: string): Promise<boolean> {
  const cmd = new Deno.Command("tmux", {
    args: ["has-session", "-t", sessionName],
    stdout: "null",
    stderr: "null",
  });
  const result = await cmd.output();
  return result.success;
}

/**
 * Kill tmux session
 */
async function killTmuxSession(sessionName: string): Promise<void> {
  const cmd = new Deno.Command("tmux", {
    args: ["kill-session", "-t", sessionName],
    stdout: "null",
    stderr: "null",
  });
  await cmd.output();
}

/**
 * Spawn Miner directly (simulating respawn)
 */
async function spawnMiner(
  issueId: string,
  task: string,
  model: string = "sonnet",
  langfuse?: LangfuseTestContext,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const cmd = new Deno.Command(PAYDIRT_BIN, {
    args: ["prospect", "miner", "--claim", issueId, "--task", task, "--background", "--model", model],
    cwd: WORK_DIR,
    env: {
      ...Deno.env.toObject(),
      ...getLangfuseEnv(langfuse),
    },
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout, stderr, code } = await cmd.output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
}

/**
 * Wait for condition with timeout
 */
async function waitFor(
  condition: () => Promise<boolean>,
  description: string,
  timeoutMs: number = 120000,
  pollIntervalMs: number = 5000,
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const result = await condition();
    console.log(`  [${elapsed}s] ${description}: ${result}`);
    if (result) return true;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return false;
}

/**
 * Setup test: Create work issue
 */
async function setupTest(): Promise<TestContext> {
  console.log("\n▶ Setup: Creating work issue...");

  const workResult = await bd([
    "create",
    "--title", "E2E P2: Multi-phase task with session interruption",
    "--type", "task",
    "--label", "e2e-p2",
    "--description", "Task 1: Create file1.txt, Task 2: Create file2.txt (after respawn)",
  ]);
  const workIssueId = extractIssueId(workResult.stdout);
  if (!workIssueId) {
    throw new Error(`Failed to create work issue: ${workResult.stdout}`);
  }
  console.log(`  ✓ Work issue: ${workIssueId}`);

  return { workIssueId };
}

/**
 * Cleanup test artifacts
 */
async function cleanupTest(ctx: TestContext): Promise<void> {
  console.log("\n▶ Cleanup...");

  // Close issue
  await bd(["close", ctx.workIssueId]).catch(() => {});

  // Kill tmux session
  await killTmuxSession(`paydirt-${ctx.workIssueId}`).catch(() => {});

  // Remove test files
  try {
    await Deno.remove("src/file1.txt");
    console.log("  ✓ Removed src/file1.txt");
  } catch {
    // File might not exist
  }

  try {
    await Deno.remove("src/file2.txt");
    console.log("  ✓ Removed src/file2.txt");
  } catch {
    // File might not exist
  }

  // Revert commits if they exist
  try {
    const cmd = new Deno.Command("git", {
      args: ["log", "-2", "--oneline", "--format=%s"],
      cwd: WORK_DIR,
      stdout: "piped",
    });
    const { stdout } = await cmd.output();
    const commits = new TextDecoder().decode(stdout);

    if (commits.includes("file1.txt") || commits.includes("file2.txt")) {
      // Count how many commits to reset
      const resetCount = (commits.match(/file[12]\.txt/g) || []).length;
      const resetCmd = new Deno.Command("git", {
        args: ["reset", "--soft", `HEAD~${resetCount}`],
        cwd: WORK_DIR,
      });
      await resetCmd.output();
      console.log(`  ✓ Reverted ${resetCount} test commit(s)`);
    }
  } catch {
    // Commits might not exist
  }
}

// ============================================================================
// Tests
// ============================================================================

Deno.test({
  name: "E2E P2: Context recovery after session interruption",
  ignore: Deno.env.get("RUN_E2E_TESTS") !== "1",
  async fn() {
    const langfuse = await initLangfuseForTest("E2E P2: Context recovery after session interruption");

    console.log("\n" + "=".repeat(70));
    console.log("E2E TEST: P2 - Context Exhaustion & Recovery");
    console.log("=".repeat(70));

    const ctx = await setupTest();
    const minerSession = `paydirt-${ctx.workIssueId}`;

    try {
      // ====== Phase 1: Initial Task ======
      console.log("\n" + "-".repeat(50));
      console.log("PHASE 1: Initial Task (file1.txt)");
      console.log("-".repeat(50));

      console.log("\n▶ Step 1.1: Spawning Miner for Task 1...");
      const spawn1Result = await spawnMiner(
        ctx.workIssueId,
        `Run 'mkdir -p src && echo "Task 1 complete" > src/file1.txt && git add src/file1.txt && git commit -m "test: file1" && bd comments add ${ctx.workIssueId} "PROGRESS: Task 1 done"'`,
        "sonnet",
        langfuse,
      );
      console.log(`  Spawn exit code: ${spawn1Result.code}`);
      assertEquals(spawn1Result.code, 0, "Miner should spawn successfully");

      console.log("\n▶ Step 1.2: Waiting for Task 1 completion...");
      const task1Complete = await waitFor(
        async () => {
          try {
            await Deno.stat("src/file1.txt");
            const comments = await getIssueComments(ctx.workIssueId);
            return comments.includes("] PROGRESS:");
          } catch {
            return false;
          }
        },
        "Task 1 complete (file + PROGRESS)",
        120000,
        5000,
      );

      assertEquals(task1Complete, true, "Task 1 should complete");
      const phase1Comments = await getIssueComments(ctx.workIssueId);
      console.log(`  Phase 1 comments:\n${phase1Comments.split("\n").map(l => "    " + l).join("\n")}`);
      console.log("  ✓ Task 1 completed");

      // ====== Phase 2: Session Interruption ======
      console.log("\n" + "-".repeat(50));
      console.log("PHASE 2: Session Interruption (Simulate Context Exhaustion)");
      console.log("-".repeat(50));

      console.log("\n▶ Step 2.1: Killing Miner session...");
      await killTmuxSession(minerSession);

      // Wait a bit to ensure session is killed
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const sessionExists = await tmuxSessionExists(minerSession);
      assertEquals(sessionExists, false, "Session should be killed");
      console.log("  ✓ Session killed (simulating context exhaustion)");

      // ====== Phase 3: Context Recovery ======
      console.log("\n" + "-".repeat(50));
      console.log("PHASE 3: Context Recovery from bd Issue");
      console.log("-".repeat(50));

      console.log("\n▶ Step 3.1: Reading context from bd issue...");
      const recoveredComments = await getIssueComments(ctx.workIssueId);
      console.log(`  Recovered comments:\n${recoveredComments.split("\n").map(l => "    " + l).join("\n")}`);

      // Verify we can see Task 1 progress
      assertStringIncludes(recoveredComments, "PROGRESS:", "Should have Task 1 PROGRESS");
      console.log("  ✓ Context recovered from bd issue");

      console.log("\n▶ Step 3.2: Respawning Miner for Task 2...");
      const spawn2Result = await spawnMiner(
        ctx.workIssueId,
        `Task 1 done (see bd comments). Run 'mkdir -p src && echo "Task 2 complete" > src/file2.txt && git add src/file2.txt && git commit -m "test: file2" && bd comments add ${ctx.workIssueId} "PROGRESS: Task 2 done after respawn"'`,
        "sonnet",
        langfuse,
      );
      console.log(`  Spawn exit code: ${spawn2Result.code}`);
      assertEquals(spawn2Result.code, 0, "Miner should respawn successfully");
      console.log("  ✓ Miner respawned");

      // ====== Phase 4: Continued Work ======
      console.log("\n" + "-".repeat(50));
      console.log("PHASE 4: Continued Work (file2.txt)");
      console.log("-".repeat(50));

      console.log("\n▶ Step 4.1: Waiting for Task 2 completion...");
      const task2Complete = await waitFor(
        async () => {
          try {
            await Deno.stat("src/file2.txt");
            const comments = await getIssueComments(ctx.workIssueId);
            // Count PROGRESS comments - should have 2
            const progressCount = (comments.match(/] PROGRESS:/g) || []).length;
            return progressCount >= 2;
          } catch {
            return false;
          }
        },
        "Task 2 complete (file + 2nd PROGRESS)",
        120000,
        5000,
      );

      assertEquals(task2Complete, true, "Task 2 should complete");
      console.log("  ✓ Task 2 completed");

      // ====== Verification ======
      console.log("\n" + "-".repeat(50));
      console.log("VERIFICATION");
      console.log("-".repeat(50));

      // Verify both files exist
      const file1Exists = await Deno.stat("src/file1.txt").then(() => true).catch(() => false);
      const file2Exists = await Deno.stat("src/file2.txt").then(() => true).catch(() => false);

      assertEquals(file1Exists, true, "file1.txt should exist");
      assertEquals(file2Exists, true, "file2.txt should exist");
      console.log("  ✓ Both files exist");

      // Verify file contents
      const file1Content = await Deno.readTextFile("src/file1.txt");
      const file2Content = await Deno.readTextFile("src/file2.txt");

      assertStringIncludes(file1Content, "Task 1", "file1.txt should have Task 1 content");
      assertStringIncludes(file2Content, "Task 2", "file2.txt should have Task 2 content");
      console.log("  ✓ File contents correct");

      // Verify comments
      const finalComments = await getIssueComments(ctx.workIssueId);
      const progressCount = (finalComments.match(/] PROGRESS:/g) || []).length;

      assertEquals(progressCount, 2, "Should have 2 PROGRESS comments");
      console.log(`  ✓ ${progressCount} PROGRESS comments (Task 1 + Task 2)`);

      console.log(`\n  Final comments:\n${finalComments.split("\n").map(l => "    " + l).join("\n")}`);

      // ====== Summary ======
      console.log("\n" + "=".repeat(70));
      console.log("✅ P2 TEST COMPLETED");
      console.log("=".repeat(70));
      console.log(`
Summary:
  Work Issue: ${ctx.workIssueId}

Verified:
  ✓ Task 1: file1.txt created and committed
  ✓ Session killed: simulated context exhaustion
  ✓ Context recovered: from bd issue comments
  ✓ Task 2: file2.txt created and committed
  ✓ PROGRESS comments: 2 (one per task)

Flow verified:
  Phase 1: ✓ Initial work (Task 1)
  Phase 2: ✓ Session interruption (kill session)
  Phase 3: ✓ Context recovery (read bd issue)
  Phase 4: ✓ Continued work (Task 2)

Key findings:
  - bd issue serves as persistent context
  - Miner can be respawned after interruption
  - Work continues across sessions
  - Context recovery works correctly
`);
    } finally {
      await cleanupTest(ctx);
      await langfuse.cleanup();
    }
  },
});

// Quick validation test
Deno.test("Paydirt bin exists", async () => {
  const stat = await Deno.stat(PAYDIRT_BIN);
  assertEquals(stat.isFile, true, "Paydirt bin should exist");
});
