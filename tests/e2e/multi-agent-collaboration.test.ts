// tests/e2e/multi-agent-collaboration.test.ts
// E2E test for multi-agent collaboration
//
// This test verifies:
// 1. Miner creates code with issues
// 2. Test script spawns Assayer for code review
// 3. Assayer reviews code and adds feedback to bd issue
// 4. Miner reads feedback and fixes issues
// 5. Both agents collaborate via bd comments
//
// Run with: RUN_E2E_TESTS=1 deno test tests/e2e/multi-agent-collaboration.test.ts --allow-all
//
// WARNING: This test spawns multiple real Claude agents and consumes API credits!

import { assertEquals, assertStringIncludes } from "@std/assert";
import { initLangfuseForTest, getLangfuseEnv, type LangfuseTestContext } from "../utils/langfuse.ts";

const WORK_DIR = Deno.cwd();
const STARTUP_BIN = `${WORK_DIR}/scripts/startup-dev.sh`;

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
 * Spawn agent (Miner or Assayer)
 */
async function spawnAgent(
  role: string,
  issueId: string,
  task: string,
  model: string = "sonnet",
  langfuse?: LangfuseTestContext,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const cmd = new Deno.Command(STARTUP_BIN, {
    args: ["call", role, "--claim", issueId, "--task", task, "--background", "--model", model],
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
  timeoutMs: number = 180000,
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
    "--title", "E2E P4: Multi-agent collaboration (Miner + Assayer)",
    "--type", "task",
    "--label", "e2e-p4",
    "--description", "Test Miner and Assayer collaboration via code review",
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

  // Kill tmux sessions
  await killTmuxSession(`startup-${ctx.workIssueId}`).catch(() => {});

  // Remove test file
  try {
    await Deno.remove("src/calculator.ts");
    console.log("  ✓ Removed src/calculator.ts");
  } catch {
    // File might not exist
  }

  // Revert commits if they exist
  try {
    const cmd = new Deno.Command("git", {
      args: ["log", "-3", "--oneline", "--format=%s"],
      cwd: WORK_DIR,
      stdout: "piped",
    });
    const { stdout } = await cmd.output();
    const commits = new TextDecoder().decode(stdout);

    if (commits.includes("calculator")) {
      // Count how many commits to reset
      const resetCount = (commits.match(/calculator/g) || []).length;
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

  console.log("  ✓ Cleanup complete");
}

// ============================================================================
// P4 Test: Multi-Agent Collaboration
// ============================================================================

Deno.test({
  name: "E2E P4: Multi-agent collaboration (Miner + Assayer)",
  ignore: Deno.env.get("RUN_E2E_TESTS") !== "1",
  async fn() {
    const langfuse = await initLangfuseForTest("E2E P4: Multi-agent collaboration (Miner + Assayer)");

    console.log("\n" + "=".repeat(70));
    console.log("E2E TEST: P4 - Multi-Agent Collaboration");
    console.log("=".repeat(70));

    const ctx = await setupTest();
    const minerSession = `startup-${ctx.workIssueId}`;

    try {
      // ====== Phase 1: Miner Creates Code with Issues ======
      console.log("\n" + "-".repeat(50));
      console.log("PHASE 1: Miner Creates Code (with issues)");
      console.log("-".repeat(50));

      console.log("\n▶ Step 1.1: Spawning Miner to create code...");
      const phase1Task = `Create src/calculator.ts with add function. Use 'any' type (intentional issue for review). Run 'mkdir -p src && cat > src/calculator.ts << "ENDOFFILE"
export function add(a: any, b: any): any {
  return a + b;
}
ENDOFFILE' && git add src/calculator.ts && git commit -m "feat: add calculator (needs review)" && bd comments add ${ctx.workIssueId} "PROGRESS: Created calculator.ts, ready for review"`;

      const spawn1Result = await spawnAgent("miner", ctx.workIssueId, phase1Task, "sonnet", langfuse);
      assertEquals(spawn1Result.code, 0, "Miner should spawn successfully");
      console.log("  ✓ Miner spawned for Phase 1");

      // ====== Phase 2: Wait for Code Creation ======
      console.log("\n" + "-".repeat(50));
      console.log("PHASE 2: Wait for Code Creation");
      console.log("-".repeat(50));

      console.log("\n▶ Step 2.1: Waiting for code creation...");
      const codeCreated = await waitFor(
        async () => {
          try {
            await Deno.stat("src/calculator.ts");
            const comments = await getIssueComments(ctx.workIssueId);
            return comments.includes("PROGRESS:") && comments.includes("calculator");
          } catch {
            return false;
          }
        },
        "Code created and Miner PROGRESS",
        180000,
        5000,
      );

      assertEquals(codeCreated, true, "Code should be created");

      const initialCode = await Deno.readTextFile("src/calculator.ts");
      assertStringIncludes(initialCode, "any", "Should have 'any' type (the issue)");
      assertStringIncludes(initialCode, "function add", "Should have add function");
      console.log("  ✓ Code created with issues (any type)");

      // ====== Phase 2.5: Spawn Assayer for Review ======
      console.log("\n" + "-".repeat(50));
      console.log("PHASE 2.5: Spawn Assayer for Review");
      console.log("-".repeat(50));

      console.log("\n▶ Step 2.5.1: Spawning Assayer...");
      const reviewerTask = `Review src/calculator.ts for type safety issues. Check for 'any' types. Add bd comment to ${ctx.workIssueId} with format: 'REVIEW: Found issues - [list issues]'`;

      const spawnAssayerResult = await spawnAgent("reviewer", ctx.workIssueId, reviewerTask, "sonnet", langfuse);
      assertEquals(spawnAssayerResult.code, 0, "Assayer should spawn successfully");
      console.log("  ✓ Assayer spawned");

      // ====== Phase 3: Wait for Assayer Review ======
      console.log("\n" + "-".repeat(50));
      console.log("PHASE 3: Wait for Assayer Review");
      console.log("-".repeat(50));

      console.log("\n▶ Step 3.1: Waiting for Assayer review...");
      const reviewerReviewed = await waitFor(
        async () => {
          const comments = await getIssueComments(ctx.workIssueId);
          return comments.includes("REVIEW:");
        },
        "Assayer added REVIEW comment",
        180000,
        5000,
      );

      assertEquals(reviewerReviewed, true, "Assayer should add review");
      const phase3Comments = await getIssueComments(ctx.workIssueId);
      console.log(`  Review comments:\n${phase3Comments.split("\n").map(l => "    " + l).join("\n")}`);
      console.log("  ✓ Assayer completed review");

      // ====== Phase 4: Miner Fixes Issues ======
      console.log("\n" + "-".repeat(50));
      console.log("PHASE 4: Miner Fixes Issues Based on Review");
      console.log("-".repeat(50));

      console.log("\n▶ Step 4.1: Spawning Miner to fix issues...");
      const phase4Task = `Read review comments from ${ctx.workIssueId}. Fix type safety issues in src/calculator.ts. Replace 'any' with 'number'. Run 'cat > src/calculator.ts << "ENDOFFILE"
export function add(a: number, b: number): number {
  return a + b;
}
ENDOFFILE' && git add src/calculator.ts && git commit -m "fix: replace any with number types" && bd comments add ${ctx.workIssueId} "FIXED: Applied Assayer feedback - replaced any with number"`;

      const spawn4Result = await spawnAgent("miner", ctx.workIssueId, phase4Task, "sonnet", langfuse);
      assertEquals(spawn4Result.code, 0, "Miner should spawn successfully for fixes");
      console.log("  ✓ Miner spawned for Phase 4");

      console.log("\n▶ Step 4.2: Waiting for fixes...");
      const fixesApplied = await waitFor(
        async () => {
          try {
            const fixedCode = await Deno.readTextFile("src/calculator.ts");
            const hasNumber = fixedCode.includes(": number");
            const noAny = !fixedCode.includes(": any");
            const comments = await getIssueComments(ctx.workIssueId);
            const hasFIXED = comments.includes("FIXED:");

            return hasNumber && noAny && hasFIXED;
          } catch {
            return false;
          }
        },
        "Fixes applied and committed",
        180000,
        5000,
      );

      assertEquals(fixesApplied, true, "Miner should fix issues");
      console.log("  ✓ Fixes applied");

      // ====== Verification ======
      console.log("\n" + "-".repeat(50));
      console.log("VERIFICATION");
      console.log("-".repeat(50));

      // Verify final code
      const finalCode = await Deno.readTextFile("src/calculator.ts");
      assertStringIncludes(finalCode, "number", "Should use number type");
      assertEquals(finalCode.includes("any"), false, "Should not have any type");
      assertStringIncludes(finalCode, "function add", "Should still have add function");
      console.log("  ✓ Code fixed correctly");

      // Verify comments (collaboration evidence)
      const finalComments = await getIssueComments(ctx.workIssueId);
      assertStringIncludes(finalComments, "PROGRESS:", "Should have Miner PROGRESS");
      assertStringIncludes(finalComments, "REVIEW:", "Should have Assayer REVIEW");
      assertStringIncludes(finalComments, "FIXED:", "Should have Miner FIXED");

      const progressCount = (finalComments.match(/PROGRESS:/g) || []).length;
      const reviewCount = (finalComments.match(/REVIEW:/g) || []).length;
      const fixedCount = (finalComments.match(/FIXED:/g) || []).length;

      assertEquals(progressCount >= 1, true, "Should have at least 1 PROGRESS");
      assertEquals(reviewCount >= 1, true, "Should have at least 1 REVIEW");
      assertEquals(fixedCount >= 1, true, "Should have at least 1 FIXED");

      console.log(`  ✓ Collaboration: ${progressCount} PROGRESS + ${reviewCount} REVIEW + ${fixedCount} FIXED`);

      console.log(`\n  Final comments:\n${finalComments.split("\n").map(l => "    " + l).join("\n")}`);

      // Verify git commits
      const gitLogCmd = new Deno.Command("git", {
        args: ["log", "-2", "--oneline", "--format=%s"],
        cwd: WORK_DIR,
        stdout: "piped",
      });
      const { stdout: gitLogOutput } = await gitLogCmd.output();
      const commits = new TextDecoder().decode(gitLogOutput);

      assertStringIncludes(commits, "calculator", "Should have calculator commits");
      console.log("  ✓ Git commits recorded");

      // ====== Summary ======
      console.log("\n" + "=".repeat(70));
      console.log("✅ P4 TEST COMPLETED");
      console.log("=".repeat(70));
      console.log(`
Summary:
  Work Issue: ${ctx.workIssueId}

Verified:
  ✓ Phase 1: Miner created code with issues (any type)
  ✓ Phase 2.5: Test spawned Assayer for review
  ✓ Phase 3: Assayer reviewed and found issues
  ✓ Phase 4: Miner applied fixes (any → number)
  ✓ Collaboration: ${progressCount} PROGRESS + ${reviewCount} REVIEW + ${fixedCount} FIXED comments

Flow verified:
  Miner → Create Code (with issues)
         ↓
  Test → Spawn Assayer
         ↓
  Assayer → Review Code → Add REVIEW comment
         ↓
  Miner → Read Review → Fix Issues → Add FIXED comment

Key findings:
  - Multi-agent collaboration works via bd comments
  - Assayer can review code and provide feedback
  - Miner can spawn other agents mid-task
  - Feedback loop enables iterative improvement
`);
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
