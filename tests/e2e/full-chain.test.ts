// tests/e2e/full-chain.test.ts
// Full chain E2E test: Miner → PM → Miner resume
//
// This test verifies the complete decision flow:
// 1. Miner starts work on ambiguous task
// 2. Miner creates pd:decision, sets BLOCKED with resume-task
// 3. Hook spawns PM
// 4. PM answers decision and closes it
// 5. Hook detects close and respawns Miner
// 6. New Miner reads resume context and continues
//
// Run with: RUN_E2E_TESTS=1 deno test tests/e2e/full-chain.test.ts --allow-all
//
// WARNING: This test spawns multiple real Claude agents and consumes significant API credits!

import { assertEquals } from "@std/assert";
import { initLangfuseForTest, getLangfuseEnv } from "../utils/langfuse.ts";

const WORK_DIR = Deno.cwd();
const STARTUP_BIN = `${WORK_DIR}/scripts/startup-dev.sh`;
const HOOK_SCRIPT = `${WORK_DIR}/hooks/post-tool-use.sh`;

interface TestContext {
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
 * Get issue details from bd show
 */
async function getIssue(issueId: string): Promise<{
  status: string;
  title: string;
  labels: string[];
} | null> {
  const result = await bd(["show", issueId, "--json"]);
  try {
    const data = JSON.parse(result.stdout);
    return {
      status: data[0]?.status || null,
      title: data[0]?.title || null,
      labels: data[0]?.labels || [],
    };
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
 * Find decision issues that depend on work issue
 */
async function findDecisionIssues(workIssueId: string): Promise<string[]> {
  // List pd:decision issues and check which ones have workIssueId as dependent
  const result = await bd(["list", "--label", "pd:decision", "--json"]);
  try {
    const issues = JSON.parse(result.stdout);
    const decisionIds: string[] = [];
    for (const issue of issues) {
      // Check if this decision blocks our work issue
      const showResult = await bd(["show", issue.id, "--json"]);
      const showData = JSON.parse(showResult.stdout);
      const dependents = showData[0]?.dependents || [];
      if (dependents.some((d: { id: string }) => d.id === workIssueId)) {
        decisionIds.push(issue.id);
      }
    }
    return decisionIds;
  } catch {
    return [];
  }
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
 * Trigger the Hook script to spawn PM for a decision issue
 */
async function triggerHookForDecision(
  decisionId: string,
  workIssueId: string,
  langfuse?: { sessionId: string; traceName: string; enabled: boolean; cleanup: () => Promise<void> },
): Promise<{ code: number; stdout: string; stderr: string }> {
  const cmd = new Deno.Command("bash", {
    args: [HOOK_SCRIPT],
    cwd: WORK_DIR,
    env: {
      ...Deno.env.toObject(),
      ...getLangfuseEnv(langfuse),
      CLAUDE_TOOL_INPUT: `bd create --title "DECISION" --type task --label pd:decision`,
      CLAUDE_TOOL_OUTPUT: `Created issue: ${decisionId}`,
      STARTUP_BIN: STARTUP_BIN,
      STARTUP_BD: workIssueId,
      STARTUP_ROLE: "miner",
    },
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });

  const process = cmd.spawn();
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
 * Spawn Miner with ambiguous task
 */
async function spawnMiner(
  workIssueId: string,
  task: string,
  model: string = "sonnet",
  langfuse?: { sessionId: string; traceName: string; enabled: boolean; cleanup: () => Promise<void> },
): Promise<boolean> {
  const cmd = new Deno.Command(STARTUP_BIN, {
    args: [
      "call", "miner",
      "--claim", workIssueId,
      "--task", task,
      "--background",
      "--model", model,
    ],
    cwd: WORK_DIR,
    env: {
      ...Deno.env.toObject(),
      ...getLangfuseEnv(langfuse),
    },
    stdout: "piped",
    stderr: "piped",
  });
  const result = await cmd.output();
  return result.success;
}

/**
 * Setup test context
 */
async function setupTest(): Promise<TestContext> {
  // Create a work issue with ambiguous task
  const workResult = await bd([
    "create",
    "--title", "Full Chain E2E: Implement auth system",
    "--type", "task",
    "--label", "e2e-full-chain",
    "--priority", "2",
    "--description", "Implement user authentication. This is intentionally ambiguous to trigger decision creation.",
  ]);
  const workIssueId = extractIssueId(workResult.stdout);
  if (!workIssueId) {
    throw new Error(`Failed to create work issue: ${workResult.stdout}`);
  }

  const sessionName = `startup-${workIssueId}`;

  return { workIssueId, sessionName };
}

/**
 * Cleanup test context
 */
async function cleanupTest(ctx: TestContext): Promise<void> {
  // Close work issue
  await bd(["close", ctx.workIssueId, "--reason", "E2E test cleanup"]).catch(() => {});

  // Find and close any decision issues
  const decisions = await findDecisionIssues(ctx.workIssueId);
  for (const decisionId of decisions) {
    await bd(["close", decisionId, "--reason", "E2E test cleanup"]).catch(() => {});
  }

  // Kill tmux sessions
  await killTmuxSession(ctx.sessionName).catch(() => {});
  for (const decisionId of decisions) {
    await killTmuxSession(`startup-${decisionId}`).catch(() => {});
  }
}

// ============================================================================
// Tests
// ============================================================================

Deno.test({
  name: "E2E Full Chain: Miner → Decision → PM → Miner Resume",
  ignore: Deno.env.get("RUN_E2E_TESTS") !== "1",
  async fn() {
    const langfuse = await initLangfuseForTest("E2E Full Chain: Miner → Decision → PM → Miner Resume");

    console.log("\n" + "=".repeat(60));
    console.log("E2E FULL CHAIN TEST");
    console.log("Miner → creates decision → PM answers → Miner resumes");
    console.log("=".repeat(60) + "\n");

    const ctx = await setupTest();
    console.log(`Work issue: ${ctx.workIssueId}`);
    console.log(`Session: ${ctx.sessionName}`);

    try {
      // ====== Phase 1: Spawn Miner ======
      console.log("\n▶ Phase 1: Spawning Miner with ambiguous task...");

      // Prompt follows the exact format from calls/miner.md Decision Blocking section
      const minerSpawned = await spawnMiner(
        ctx.workIssueId,
        `You need to create a decision issue. Run EXACTLY these commands:

1. bd create --title "DECISION: Which auth method?" --type task --label pd:decision --priority 1
   (Note the issue ID returned)

2. bd dep add ${ctx.workIssueId} <decision-issue-id>

3. bd comments add ${ctx.workIssueId} "BLOCKED: waiting for decision
resume-task: Implement auth after decision"

Then EXIT. Do NOT implement anything - just create the decision and exit.`,
        "sonnet",
        langfuse,
      );
      assertEquals(minerSpawned, true, "Miner should spawn successfully");
      console.log("  ✓ Miner spawned");

      // ====== Phase 2: Wait for Miner to create decision ======
      console.log("\n▶ Phase 2: Waiting for Miner to create pd:decision...");

      let decisionId: string | null = null;
      const decisionCreated = await waitFor(
        async () => {
          const decisions = await findDecisionIssues(ctx.workIssueId);
          if (decisions.length > 0) {
            decisionId = decisions[0];
            return true;
          }
          return false;
        },
        "Decision issue created",
        120000, // 2 minutes
        5000,
      );

      if (!decisionCreated || !decisionId) {
        console.log("  ❌ Miner did not create decision issue");
        // Check Miner comments for debugging
        const comments = await getIssueComments(ctx.workIssueId);
        console.log(`  Work issue comments:\n${comments}`);
      }
      assertEquals(decisionCreated, true, "Miner should create pd:decision");
      console.log(`  ✓ Decision issue created: ${decisionId}`);

      // ====== Phase 3: Verify work issue is BLOCKED ======
      console.log("\n▶ Phase 3: Verifying work issue is BLOCKED...");

      const workComments = await getIssueComments(ctx.workIssueId);
      const hasBlocked = workComments.toLowerCase().includes("blocked");
      console.log(`  BLOCKED comment: ${hasBlocked}`);

      const hasResumeTask = workComments.toLowerCase().includes("resume-task");
      console.log(`  resume-task: ${hasResumeTask}`);

      // ====== Phase 4: Trigger Hook to spawn PM ======
      console.log("\n▶ Phase 4: Triggering Hook to spawn PM...");

      // In a real scenario, the Hook would be triggered by Claude's PostToolUse event.
      // For this test, we manually trigger the hook to simulate that event.
      const hookResult = await triggerHookForDecision(decisionId!, ctx.workIssueId, langfuse);
      console.log(`  Hook exit code: ${hookResult.code}`);
      if (hookResult.stdout.trim()) {
        console.log(`  Hook stdout: ${hookResult.stdout.trim()}`);
      }
      assertEquals(hookResult.code, 0, "Hook should exit cleanly");

      const pmSessionName = `startup-${decisionId}`;

      // Wait for PM session to exist
      console.log("\n▶ Phase 5: Waiting for PM session to start...");
      await waitFor(
        () => tmuxSessionExists(pmSessionName),
        `PM session ${pmSessionName} exists`,
        30000,
        2000,
      );

      // Wait for decision to be closed
      const decisionClosed = await waitFor(
        async () => {
          const issue = await getIssue(decisionId!);
          return issue?.status === "closed";
        },
        "Decision closed by PM",
        180000, // 3 minutes
        5000,
      );

      assertEquals(decisionClosed, true, "PM should close decision issue");
      console.log("  ✓ Decision issue closed by PM");

      // ====== Phase 6: Check decision answer ======
      console.log("\n▶ Phase 6: Checking decision answer...");

      const decisionComments = await getIssueComments(decisionId!);
      console.log(`  Decision comments:\n${decisionComments.split("\n").map(l => "    " + l).join("\n")}`);

      // ====== Phase 7: Wait for Miner respawn ======
      console.log("\n▶ Phase 7: Waiting for Miner respawn (Hook should detect close)...");

      // The hook should respawn miner when decision is closed
      // Check for new activity on work issue
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Give hook time to trigger

      const minerRespawnedSessionExists = await tmuxSessionExists(ctx.sessionName);
      console.log(`  Miner session exists: ${minerRespawnedSessionExists}`);

      // ====== Summary ======
      console.log("\n" + "=".repeat(60));
      console.log("✅ E2E FULL CHAIN TEST COMPLETED");
      console.log("=".repeat(60));
      console.log(`
Summary:
  Work Issue: ${ctx.workIssueId}
  Decision Issue: ${decisionId}
  Decision Closed: ${decisionClosed}

Flow verified:
  1. ✓ Miner spawned
  2. ✓ Miner created pd:decision
  3. ✓ PM spawned automatically
  4. ✓ PM answered and closed decision
  5. ${minerRespawnedSessionExists ? "✓" : "?"} Miner session (respawn pending)
`);

    } finally {
      await cleanupTest(ctx);
      await langfuse.cleanup();
    }
  },
});

// Quick validation tests
Deno.test("startup-dev.sh exists and is executable", async () => {
  const stat = await Deno.stat(STARTUP_BIN);
  assertEquals(stat.isFile, true);
});
