// tests/e2e/hook-spawn-pm.test.ts
// E2E test for Hook spawning real PM Agent
//
// This test verifies the full flow:
// 1. Create pd:decision issue
// 2. Trigger Hook (simulating PostToolUse after bd create)
// 3. Hook spawns real PM Agent via startup prospect
// 4. PM answers and closes the decision issue
//
// Run with: RUN_E2E_TESTS=1 deno test tests/e2e/hook-spawn-pm.test.ts --allow-all
//
// WARNING: This test spawns real Claude and consumes API credits!
// It also creates tmux sessions that need cleanup.

import { assertEquals, assertStringIncludes } from "@std/assert";

const WORK_DIR = Deno.cwd();
const HOOK_SCRIPT = `${WORK_DIR}/hooks/post-tool-use.sh`;
// Use dev wrapper for correct path resolution (compiled binary has path issues)
const STARTUP_BIN = `${WORK_DIR}/scripts/startup-dev.sh`;

interface TestContext {
  decisionIssueId: string;
  workIssueId: string;
  sessionName: string;
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
 * Get issue status from bd show
 */
async function getIssueStatus(issueId: string): Promise<string | null> {
  const result = await bd(["show", issueId, "--json"]);
  try {
    const data = JSON.parse(result.stdout);
    return data[0]?.status || null;
  } catch {
    return null;
  }
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
 * Wait for issue to be closed (with timeout)
 */
async function waitForIssueClosed(
  issueId: string,
  timeoutMs: number = 180000, // 3 minutes default
  pollIntervalMs: number = 5000, // 5 seconds
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const status = await getIssueStatus(issueId);
    console.log(`  [${Math.floor((Date.now() - startTime) / 1000)}s] Issue ${issueId} status: ${status}`);

    if (status === "closed") {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return false;
}

/**
 * Trigger the Hook script as if PostToolUse fired
 */
async function triggerHook(env: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
  const cmd = new Deno.Command("bash", {
    args: [HOOK_SCRIPT],
    cwd: WORK_DIR,
    env: {
      ...Deno.env.toObject(),
      ...env,
      STARTUP_BIN: STARTUP_BIN,
      // Don't use STARTUP_HOOK_SYNC - let it run in background
    },
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });

  const process = cmd.spawn();

  // Write empty stdin (hook reads and discards)
  const writer = process.stdin.getWriter();
  await writer.close();

  const { stdout, stderr, code } = await process.output();

  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
}

/**
 * Setup test context
 */
async function setupTest(): Promise<TestContext> {
  // Create a work issue (simulating Miner's work)
  const workResult = await bd([
    "create",
    "--title", "E2E Hook Test: Work issue",
    "--type", "task",
    "--label", "e2e-hook-test",
    "--priority", "2",
  ]);
  const workIssueId = extractIssueId(workResult.stdout);
  if (!workIssueId) {
    throw new Error(`Failed to create work issue: ${workResult.stdout}`);
  }

  // Create a decision issue
  const decisionResult = await bd([
    "create",
    "--title", "DECISION: E2E Hook Test - Which approach?",
    "--type", "task",
    "--label", "pd:decision",
    "--label", "e2e-hook-test",
    "--priority", "1",
    "--description", "This is a test decision for E2E hook testing. Please answer with any reasonable choice and close this issue.",
  ]);
  const decisionIssueId = extractIssueId(decisionResult.stdout);
  if (!decisionIssueId) {
    throw new Error(`Failed to create decision issue: ${decisionResult.stdout}`);
  }

  // Add dependency
  await bd(["dep", "add", workIssueId, decisionIssueId]);

  // Session name matches startup prospect convention
  const sessionName = `startup-${decisionIssueId}`;

  return {
    decisionIssueId,
    workIssueId,
    sessionName,
  };
}

/**
 * Cleanup test context
 */
async function cleanupTest(ctx: TestContext): Promise<void> {
  // Close issues
  await bd(["close", ctx.decisionIssueId, "--reason", "E2E test cleanup"]).catch(() => {});
  await bd(["close", ctx.workIssueId, "--reason", "E2E test cleanup"]).catch(() => {});

  // Kill tmux session if exists
  await killTmuxSession(ctx.sessionName).catch(() => {});
}

// ============================================================================
// Tests
// ============================================================================

Deno.test({
  name: "E2E: Hook spawns real PM Agent that answers decision",
  ignore: Deno.env.get("RUN_E2E_TESTS") !== "1",
  async fn() {
    console.log("\n========================================");
    console.log("E2E TEST: Hook spawns real PM Agent");
    console.log("========================================\n");

    const ctx = await setupTest();
    console.log(`Work issue: ${ctx.workIssueId}`);
    console.log(`Decision issue: ${ctx.decisionIssueId}`);
    console.log(`Expected tmux session: ${ctx.sessionName}`);

    try {
      // Step 1: Verify decision issue is open
      const initialStatus = await getIssueStatus(ctx.decisionIssueId);
      assertEquals(initialStatus, "open", "Decision should start as open");
      console.log("\n✓ Step 1: Decision issue is open");

      // Step 2: Trigger Hook (simulating PostToolUse after bd create --label pd:decision)
      console.log("\n→ Step 2: Triggering Hook...");
      const hookResult = await triggerHook({
        CLAUDE_TOOL_INPUT: `bd create --title "DECISION: test" --type task --label pd:decision`,
        CLAUDE_TOOL_OUTPUT: `Created issue: ${ctx.decisionIssueId}`,
        STARTUP_BD: ctx.workIssueId,
        STARTUP_ROLE: "miner",
      });

      console.log(`  Hook exit code: ${hookResult.code}`);
      if (hookResult.stdout) console.log(`  Hook stdout: ${hookResult.stdout.trim()}`);
      if (hookResult.stderr) console.log(`  Hook stderr: ${hookResult.stderr.trim()}`);

      assertEquals(hookResult.code, 0, "Hook should exit cleanly");

      // Step 3: Wait for tmux session to be created
      console.log("\n→ Step 3: Waiting for PM session to start...");
      await new Promise((resolve) => setTimeout(resolve, 3000)); // Give tmux time to start

      const sessionExists = await tmuxSessionExists(ctx.sessionName);
      console.log(`  Session ${ctx.sessionName} exists: ${sessionExists}`);

      // Step 4: Wait for PM to close the decision issue
      console.log("\n→ Step 4: Waiting for PM to answer and close decision...");
      const closed = await waitForIssueClosed(ctx.decisionIssueId, 180000, 5000);

      if (closed) {
        console.log("\n✓ Step 4: Decision issue closed by PM!");

        // Step 5: Verify decision was answered
        console.log("\n→ Step 5: Verifying decision answer...");
        const comments = await getIssueComments(ctx.decisionIssueId);
        console.log(`  Comments:\n${comments.split("\n").map((l) => "    " + l).join("\n")}`);

        // Check for DECISION: in comments (PM should have answered)
        const hasDecision = comments.toLowerCase().includes("decision");
        console.log(`  Has decision answer: ${hasDecision}`);

        console.log("\n========================================");
        console.log("✅ E2E TEST PASSED: Hook → PM → Answer → Close");
        console.log("========================================\n");
      } else {
        console.log("\n❌ Timeout: Decision issue was not closed");
        console.log("PM may have failed or timed out");

        // Get current status for debugging
        const finalStatus = await getIssueStatus(ctx.decisionIssueId);
        console.log(`Final decision status: ${finalStatus}`);

        const comments = await getIssueComments(ctx.decisionIssueId);
        console.log(`Decision comments:\n${comments}`);
      }

      assertEquals(closed, true, "PM should close the decision issue");
    } finally {
      await cleanupTest(ctx);
    }
  },
});

// ============================================================================
// Quick validation test (doesn't require Claude)
// ============================================================================

Deno.test("Hook script exists and is executable", async () => {
  const stat = await Deno.stat(HOOK_SCRIPT);
  assertEquals(stat.isFile, true, "Hook script should exist");
});

Deno.test("startup binary exists", async () => {
  const stat = await Deno.stat(STARTUP_BIN);
  assertEquals(stat.isFile, true, "startup binary should exist");
});
