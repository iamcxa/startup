// tests/e2e/error-handling.test.ts
// E2E test for error handling scenarios
//
// This test verifies how the system handles various error conditions:
// 1. PM unable to decide (UNABLE_TO_DECIDE response)
// 2. PM answer with incorrect format (missing priority)
// 3. Resume task execution failure (invalid command)
//
// Run with: RUN_E2E_TESTS=1 deno test tests/e2e/error-handling.test.ts --allow-all
//
// WARNING: This test spawns real Claude agents and consumes API credits!

import { assertEquals, assertStringIncludes } from "@std/assert";
import { initLangfuseForTest, getLangfuseEnv, type LangfuseTestContext } from "../utils/langfuse.ts";

const WORK_DIR = Deno.cwd();
const STARTUP_BIN = `${WORK_DIR}/scripts/startup-dev.sh`;

interface TestContext {
  workIssueId: string;
  decisionIssueId: string;
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
 * Spawn Miner directly
 */
async function spawnMiner(
  issueId: string,
  task: string,
  model: string = "sonnet",
  langfuse?: LangfuseTestContext,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const cmd = new Deno.Command(STARTUP_BIN, {
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
 * Setup test: Create work and decision issues
 */
async function setupTest(scenario: string): Promise<TestContext> {
  console.log(`\n▶ Setup: Creating issues for ${scenario}...`);

  const workResult = await bd([
    "create",
    "--title", `E2E P3: ${scenario}`,
    "--type", "task",
    "--label", "e2e-p3",
    "--description", `Error handling test: ${scenario}`,
  ]);
  const workIssueId = extractIssueId(workResult.stdout);
  if (!workIssueId) {
    throw new Error(`Failed to create work issue: ${workResult.stdout}`);
  }
  console.log(`  ✓ Work issue: ${workIssueId}`);

  const decisionResult = await bd([
    "create",
    "--title", `Decision for ${scenario}`,
    "--type", "task",
    "--label", "pd:decision",
    "--description", `Test decision for ${scenario}`,
  ]);
  const decisionIssueId = extractIssueId(decisionResult.stdout);
  if (!decisionIssueId) {
    throw new Error(`Failed to create decision issue: ${decisionResult.stdout}`);
  }
  console.log(`  ✓ Decision issue: ${decisionIssueId}`);

  // Add dependency
  await bd(["dep", "add", workIssueId, decisionIssueId]);
  console.log(`  ✓ Dependency added: ${workIssueId} depends on ${decisionIssueId}`);

  return { workIssueId, decisionIssueId };
}

/**
 * Cleanup test artifacts
 */
async function cleanupTest(ctx: TestContext): Promise<void> {
  console.log("\n▶ Cleanup...");

  // Close issues
  await bd(["close", ctx.workIssueId, ctx.decisionIssueId]).catch(() => {});

  // Kill tmux session
  await killTmuxSession(`startup-${ctx.workIssueId}`).catch(() => {});

  console.log("  ✓ Cleanup complete");
}

// ============================================================================
// Scenario 1: PM Unable to Decide
// ============================================================================

Deno.test({
  name: "P3 Scenario 1: PM unable to decide (UNABLE_TO_DECIDE)",
  ignore: Deno.env.get("RUN_E2E_TESTS") !== "1",
  async fn() {
    const langfuse = await initLangfuseForTest("P3 Scenario 1: PM unable to decide (UNABLE_TO_DECIDE)");

    console.log("\n" + "=".repeat(70));
    console.log("P3 SCENARIO 1: PM Unable to Decide");
    console.log("=".repeat(70));

    const ctx = await setupTest("PM unable to decide");
    const minerSession = `startup-${ctx.workIssueId}`;

    try {
      // ====== Setup: Create BLOCKED comment with decision ======
      console.log("\n▶ Step 1: Adding BLOCKED comment...");
      await bd([
        "comments", "add", ctx.workIssueId,
        `BLOCKED: waiting for ${ctx.decisionIssueId} | resume-task: Read decision from ${ctx.decisionIssueId}. If PM unable to decide, add PROGRESS comment "PM could not decide, using fallback: X". Otherwise follow decision.`,
      ]);
      console.log("  ✓ BLOCKED comment added");

      // ====== Setup: PM answers UNABLE_TO_DECIDE ======
      console.log("\n▶ Step 2: PM answering UNABLE_TO_DECIDE...");
      await bd([
        "comments", "add", ctx.decisionIssueId,
        `ANSWER [low]: UNABLE_TO_DECIDE - Insufficient context to make a decision.

Reasoning: The question requires domain knowledge not provided.
Recommendation: Use fallback option A or request more information.`,
      ]);
      await bd(["close", ctx.decisionIssueId]);
      console.log("  ✓ PM answered UNABLE_TO_DECIDE");

      // ====== Spawn Miner ======
      console.log("\n▶ Step 3: Spawning Miner to handle unable-to-decide...");
      const spawnResult = await spawnMiner(
        ctx.workIssueId,
        `Read decision from ${ctx.decisionIssueId}. If PM unable to decide, run 'bd comments add ${ctx.workIssueId} "PROGRESS: PM could not decide, using fallback: option A"'. Otherwise follow decision.`,
        "sonnet",
        langfuse,
      );
      assertEquals(spawnResult.code, 0, "Miner should spawn successfully");
      console.log("  ✓ Miner spawned");

      // ====== Wait for Miner to handle ======
      console.log("\n▶ Step 4: Waiting for Miner to handle UNABLE_TO_DECIDE...");
      const minerHandled = await waitFor(
        async () => {
          const comments = await getIssueComments(ctx.workIssueId);
          return comments.includes("PROGRESS:") && comments.includes("could not decide");
        },
        "Miner handled UNABLE_TO_DECIDE",
        120000,
        5000,
      );

      assertEquals(minerHandled, true, "Miner should handle UNABLE_TO_DECIDE");

      // ====== Verification ======
      console.log("\n▶ Verification...");
      const finalComments = await getIssueComments(ctx.workIssueId);
      console.log(`  Comments:\n${finalComments.split("\n").map(l => "    " + l).join("\n")}`);

      assertStringIncludes(
        finalComments.toLowerCase(),
        "could not decide",
        "Should acknowledge PM could not decide",
      );
      assertStringIncludes(
        finalComments.toLowerCase(),
        "fallback",
        "Should mention fallback strategy",
      );

      console.log("\n✅ Scenario 1 PASSED: Miner handled UNABLE_TO_DECIDE correctly");
    } finally {
      await cleanupTest(ctx);
      await langfuse.cleanup();
    }
  },
});

// ============================================================================
// Scenario 2: PM Answer Missing Priority Format
// ============================================================================

Deno.test({
  name: "P3 Scenario 2: PM answer with incorrect format (missing priority)",
  ignore: Deno.env.get("RUN_E2E_TESTS") !== "1",
  async fn() {
    const langfuse = await initLangfuseForTest("P3 Scenario 2: PM answer with incorrect format (missing priority)");

    console.log("\n" + "=".repeat(70));
    console.log("P3 SCENARIO 2: PM Answer Missing Priority");
    console.log("=".repeat(70));

    const ctx = await setupTest("PM answer missing priority");
    const minerSession = `startup-${ctx.workIssueId}`;

    try {
      // ====== Setup: Create BLOCKED comment ======
      console.log("\n▶ Step 1: Adding BLOCKED comment...");
      await bd([
        "comments", "add", ctx.workIssueId,
        `BLOCKED: waiting for ${ctx.decisionIssueId} | resume-task: Read decision from ${ctx.decisionIssueId}. Create src/test-p3-s2.txt with content from decision. Git commit. Add PROGRESS.`,
      ]);
      console.log("  ✓ BLOCKED comment added");

      // ====== Setup: PM answers WITHOUT [priority] format ======
      console.log("\n▶ Step 2: PM answering without [priority] format...");
      await bd([
        "comments", "add", ctx.decisionIssueId,
        `ANSWER: Use content "Scenario 2: Missing priority format test"

This answer intentionally omits the [high]/[medium]/[low] priority marker to test error handling.`,
      ]);
      await bd(["close", ctx.decisionIssueId]);
      console.log("  ✓ PM answered without priority format");

      // ====== Spawn Miner ======
      console.log("\n▶ Step 3: Spawning Miner...");
      const spawnResult = await spawnMiner(
        ctx.workIssueId,
        `Read decision from ${ctx.decisionIssueId}. Create src/test-p3-s2.txt with content from decision. Run 'mkdir -p src && echo "Scenario 2: Missing priority format test" > src/test-p3-s2.txt && git add src/test-p3-s2.txt && git commit -m "test(p3): scenario 2" && bd comments add ${ctx.workIssueId} "PROGRESS: Created test-p3-s2.txt"'`,
        "sonnet",
        langfuse,
      );
      assertEquals(spawnResult.code, 0, "Miner should spawn successfully");
      console.log("  ✓ Miner spawned");

      // ====== Wait for Miner to complete ======
      console.log("\n▶ Step 4: Waiting for Miner to complete despite format issue...");
      const minerComplete = await waitFor(
        async () => {
          try {
            await Deno.stat("src/test-p3-s2.txt");
            const comments = await getIssueComments(ctx.workIssueId);
            return comments.includes("PROGRESS:");
          } catch {
            return false;
          }
        },
        "Miner completed task",
        120000,
        5000,
      );

      assertEquals(minerComplete, true, "Miner should complete despite missing priority format");

      // ====== Verification ======
      console.log("\n▶ Verification...");
      const fileExists = await Deno.stat("src/test-p3-s2.txt").then(() => true).catch(() => false);
      assertEquals(fileExists, true, "File should be created");

      const content = await Deno.readTextFile("src/test-p3-s2.txt");
      assertStringIncludes(content, "Scenario 2", "File should have correct content");

      const finalComments = await getIssueComments(ctx.workIssueId);
      assertStringIncludes(finalComments, "PROGRESS:", "Should have PROGRESS comment");

      // Cleanup test file
      await Deno.remove("src/test-p3-s2.txt");
      const resetCmd = new Deno.Command("git", {
        args: ["reset", "--soft", "HEAD~1"],
        cwd: WORK_DIR,
      });
      await resetCmd.output();

      console.log("\n✅ Scenario 2 PASSED: Miner tolerated missing priority format");
    } finally {
      await cleanupTest(ctx);
      await langfuse.cleanup();
    }
  },
});

// ============================================================================
// Scenario 3: Resume Task Execution Failure
// ============================================================================

Deno.test({
  name: "P3 Scenario 3: Resume task execution failure",
  ignore: Deno.env.get("RUN_E2E_TESTS") !== "1",
  async fn() {
    const langfuse = await initLangfuseForTest("P3 Scenario 3: Resume task execution failure");

    console.log("\n" + "=".repeat(70));
    console.log("P3 SCENARIO 3: Resume Task Execution Failure");
    console.log("=".repeat(70));

    const ctx = await setupTest("Resume task failure");
    const minerSession = `startup-${ctx.workIssueId}`;

    try {
      // ====== Setup: Create BLOCKED comment with INVALID task ======
      console.log("\n▶ Step 1: Adding BLOCKED comment with invalid task...");
      await bd([
        "comments", "add", ctx.workIssueId,
        `BLOCKED: waiting for ${ctx.decisionIssueId} | resume-task: Run 'cat /nonexistent/invalid/path/file.txt' and report result or error.`,
      ]);
      console.log("  ✓ BLOCKED comment added with invalid command");

      // ====== Setup: PM answers normally ======
      console.log("\n▶ Step 2: PM answering normally...");
      await bd([
        "comments", "add", ctx.decisionIssueId,
        `ANSWER [medium]: Proceed with the command as instructed.`,
      ]);
      await bd(["close", ctx.decisionIssueId]);
      console.log("  ✓ PM answered");

      // ====== Spawn Miner ======
      console.log("\n▶ Step 3: Spawning Miner with invalid task...");
      const spawnResult = await spawnMiner(
        ctx.workIssueId,
        `Run 'cat /nonexistent/invalid/path/file.txt && bd comments add ${ctx.workIssueId} "PROGRESS: Command succeeded"' OR if it fails, run 'bd comments add ${ctx.workIssueId} "ERROR: Command failed - file not found"'`,
        "sonnet",
        langfuse,
      );
      assertEquals(spawnResult.code, 0, "Miner should spawn successfully");
      console.log("  ✓ Miner spawned");

      // ====== Wait for Miner to report error ======
      console.log("\n▶ Step 4: Waiting for Miner to report error...");
      const minerReported = await waitFor(
        async () => {
          const comments = await getIssueComments(ctx.workIssueId);
          return comments.includes("ERROR:") || comments.includes("PROGRESS:");
        },
        "Miner reported result",
        120000,
        5000,
      );

      assertEquals(minerReported, true, "Miner should report error or handle it");

      // ====== Verification ======
      console.log("\n▶ Verification...");
      const finalComments = await getIssueComments(ctx.workIssueId);
      console.log(`  Comments:\n${finalComments.split("\n").map(l => "    " + l).join("\n")}`);

      // Miner should either report ERROR or handle the failure gracefully
      const hasErrorHandling =
        finalComments.toLowerCase().includes("error") ||
        finalComments.toLowerCase().includes("failed") ||
        finalComments.toLowerCase().includes("not found") ||
        finalComments.toLowerCase().includes("could not");

      assertEquals(hasErrorHandling, true, "Should report or handle the error");

      console.log("\n✅ Scenario 3 PASSED: Miner handled execution failure");
    } finally {
      await cleanupTest(ctx);
      await langfuse.cleanup();
    }
  },
});

// Quick validation test
Deno.test("Startup bin exists", async () => {
  const stat = await Deno.stat(STARTUP_BIN);
  assertEquals(stat.isFile, true, "Startup bin should exist");
});
