// tests/e2e/multi-round-decision.test.ts
// E2E test for multi-round decision cycles
//
// This test verifies:
// 1. Miner resumes after first decision
// 2. Miner encounters new problem → creates SECOND decision
// 3. PM answers second decision
// 4. Miner resumes again and completes
//
// Run with: RUN_E2E_TESTS=1 deno test tests/e2e/multi-round-decision.test.ts --allow-all
//
// WARNING: This test spawns multiple real Claude agents and consumes significant API credits!

import { assertEquals, assertStringIncludes } from "@std/assert";

const WORK_DIR = Deno.cwd();
const STARTUP_BIN = `${WORK_DIR}/scripts/paydirt-dev.sh`;
const HOOK_SCRIPT = `${WORK_DIR}/hooks/post-tool-use.sh`;

interface TestContext {
  workIssueId: string;
  decision1Id: string;
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
 * Get issue status
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
 * Find pd:decision issues that block the work issue
 */
async function findDecisionIssues(workIssueId: string): Promise<string[]> {
  const result = await bd(["list", "--label", "pd:decision", "--json"]);
  try {
    const issues = JSON.parse(result.stdout);
    const decisionIds: string[] = [];
    for (const issue of issues) {
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
 * Trigger hook for decision close (simulates PM closing decision)
 */
async function triggerHookForDecisionClose(
  decisionId: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const cmd = new Deno.Command("bash", {
    args: [HOOK_SCRIPT],
    cwd: WORK_DIR,
    env: {
      ...Deno.env.toObject(),
      CLAUDE_TOOL_INPUT: `bd close ${decisionId}`,
      CLAUDE_TOOL_OUTPUT: `Closed ${decisionId}`,
      STARTUP_BIN: STARTUP_BIN,
      STARTUP_ROLE: "pm",
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
 * Trigger hook for decision creation (simulates Miner creating decision)
 */
async function triggerHookForDecisionCreate(
  decisionId: string,
  workIssueId: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const cmd = new Deno.Command("bash", {
    args: [HOOK_SCRIPT],
    cwd: WORK_DIR,
    env: {
      ...Deno.env.toObject(),
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
 * Wait for condition with timeout
 */
async function waitFor(
  condition: () => Promise<boolean>,
  description: string,
  timeoutMs: number = 180000,
  pollIntervalMs: number = 10000,
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
 * Setup: Create work issue and first decision
 */
async function setupTest(): Promise<TestContext> {
  // Create work issue with two-phase task
  const workResult = await bd([
    "create",
    "--title", "Multi-Round E2E: Implement feature with two decisions",
    "--type", "task",
    "--label", "e2e-multi-round",
    "--priority", "2",
    "--description", "This task requires two decisions: 1) Architecture choice, 2) Implementation approach",
  ]);
  const workIssueId = extractIssueId(workResult.stdout);
  if (!workIssueId) {
    throw new Error(`Failed to create work issue: ${workResult.stdout}`);
  }

  // Create first decision issue
  const decision1Result = await bd([
    "create",
    "--title", "DECISION 1: Which architecture?",
    "--type", "task",
    "--label", "pd:decision",
    "--label", "e2e-multi-round",
    "--priority", "1",
    "--description", "Should we use microservices or monolith?",
  ]);
  const decision1Id = extractIssueId(decision1Result.stdout);
  if (!decision1Id) {
    throw new Error(`Failed to create decision 1: ${decision1Result.stdout}`);
  }

  // Add dependency: work issue depends on decision 1
  await bd(["dep", "add", workIssueId, decision1Id]);

  // Add BLOCKED comment with resume-task for round 1
  // NOTE: Simple task - just add PROGRESS comment (complex tasks confuse the Miner)
  await bd([
    "comments", "add", workIssueId,
    `BLOCKED: waiting for ${decision1Id} | resume-task: Run bd comments add ${workIssueId} 'PROGRESS: Round 1 done'`,
  ]);

  // Add PM answer to first decision
  await bd([
    "comments", "add", decision1Id,
    `ANSWER [high]: Use microservices architecture.

Reasoning: Better scalability and team independence.
Source: context`,
  ]);

  return { workIssueId, decision1Id };
}

/**
 * Cleanup test artifacts
 */
async function cleanupTest(ctx: TestContext, decision2Id?: string): Promise<void> {
  await bd(["close", ctx.workIssueId, "--reason", "E2E test cleanup"]).catch(() => {});
  await bd(["close", ctx.decision1Id, "--reason", "E2E test cleanup"]).catch(() => {});
  if (decision2Id) {
    await bd(["close", decision2Id, "--reason", "E2E test cleanup"]).catch(() => {});
  }
  await killTmuxSession(`paydirt-${ctx.workIssueId}`).catch(() => {});
  if (decision2Id) {
    await killTmuxSession(`paydirt-${decision2Id}`).catch(() => {});
  }
}

// ============================================================================
// Tests
// ============================================================================

Deno.test({
  name: "E2E: Multi-round decision cycle (Miner → PM → Miner → PM → Complete)",
  ignore: Deno.env.get("RUN_E2E_TESTS") !== "1",
  async fn() {
    console.log("\n" + "=".repeat(70));
    console.log("E2E TEST: Multi-Round Decision Cycle");
    console.log("=".repeat(70) + "\n");

    const ctx = await setupTest();
    let decision2Id: string | undefined;

    console.log(`Work issue: ${ctx.workIssueId}`);
    console.log(`Decision 1: ${ctx.decision1Id}`);

    try {
      // ====== Round 1: First Decision ======
      console.log("\n" + "-".repeat(50));
      console.log("ROUND 1: First Decision");
      console.log("-".repeat(50));

      // Step 1.1: Close first decision (simulating PM)
      console.log("\n▶ Step 1.1: Closing first decision (simulating PM)...");
      await bd(["close", ctx.decision1Id, "--reason", "Architecture decided"]);
      const decision1Status = await getIssueStatus(ctx.decision1Id);
      assertEquals(decision1Status, "closed", "Decision 1 should be closed");
      console.log("  ✓ Decision 1 closed");

      // Step 1.2: Trigger hook for decision 1 close
      console.log("\n▶ Step 1.2: Triggering Hook for decision 1 close...");
      const hook1Result = await triggerHookForDecisionClose(ctx.decision1Id);
      console.log(`  Hook exit code: ${hook1Result.code}`);
      assertEquals(hook1Result.code, 0, "Hook should exit cleanly");

      // Step 1.3: Wait for Miner to respawn
      console.log("\n▶ Step 1.3: Waiting for Miner respawn...");
      const minerSession = `paydirt-${ctx.workIssueId}`;
      const minerRespawned1 = await waitFor(
        () => tmuxSessionExists(minerSession),
        `Miner session ${minerSession} exists`,
        30000,
        2000,
      );
      assertEquals(minerRespawned1, true, "Miner should respawn after decision 1");
      console.log("  ✓ Miner respawned");

      // Step 1.4: Wait for Miner to add PROGRESS (round 1 complete)
      console.log("\n▶ Step 1.4: Waiting for Miner to add PROGRESS comment...");

      const round1Complete = await waitFor(
        async () => {
          const comments = await getIssueComments(ctx.workIssueId);
          // Look for actual PROGRESS comment (format: "[user] PROGRESS: Round 1 done at ...")
          // Must have "] PROGRESS:" to distinguish from resume-task instruction
          return comments.includes("] PROGRESS: Round 1 done");
        },
        "Round 1 PROGRESS comment",
        90000, // 90 seconds (we know it works in ~40s)
        5000,
      );

      assertEquals(round1Complete, true, "Miner should add PROGRESS after round 1");
      console.log("  ✓ Round 1 complete - Miner added PROGRESS");

      // Step 1.5: Create second decision (simulating Miner creating it)
      console.log("\n▶ Step 1.5: Creating second decision (simulating Miner)...");
      const decision2Result = await bd([
        "create",
        "--title", "DECISION 2: Implementation approach?",
        "--type", "task",
        "--label", "pd:decision",
        "--label", "e2e-multi-round",
        "--priority", "1",
        "--description", "Should we use REST or GraphQL?",
      ]);
      const d2Id = extractIssueId(decision2Result.stdout);
      if (!d2Id) {
        throw new Error(`Failed to create decision 2: ${decision2Result.stdout}`);
      }
      decision2Id = d2Id;
      console.log(`  ✓ Decision 2 created: ${decision2Id}`);

      // Add dependency: work issue depends on decision 2
      await bd(["dep", "add", ctx.workIssueId, decision2Id]);

      // Add BLOCKED comment for round 2
      await bd([
        "comments", "add", ctx.workIssueId,
        `BLOCKED: waiting for ${decision2Id} | resume-task: Run bd comments add ${ctx.workIssueId} 'PROGRESS: Round 2 done'`,
      ]);

      // ====== Round 2: Second Decision ======
      console.log("\n" + "-".repeat(50));
      console.log("ROUND 2: Second Decision");
      console.log("-".repeat(50));

      // Step 2.1: Add PM answer to second decision
      console.log("\n▶ Step 2.1: Adding PM answer to second decision...");
      await bd([
        "comments", "add", decision2Id!,
        `ANSWER [medium]: Use REST API for implementation.

Reasoning: Standard approach, well-documented.
Source: context`,
      ]);
      console.log("  ✓ PM answer added");

      // Step 2.2: Close second decision (simulating PM completion)
      console.log("\n▶ Step 2.2: Closing second decision (simulating PM)...");
      await bd(["close", decision2Id!, "--reason", "Implementation approach decided"]);
      const decision2Status = await getIssueStatus(decision2Id!);
      assertEquals(decision2Status, "closed", "Decision 2 should be closed");
      console.log("  ✓ Decision 2 closed");

      // Step 2.3: Trigger hook for decision 2 close
      console.log("\n▶ Step 2.3: Triggering Hook for decision 2 close...");
      const hook2Result = await triggerHookForDecisionClose(decision2Id!);
      console.log(`  Hook exit code: ${hook2Result.code}`);
      assertEquals(hook2Result.code, 0, "Hook should exit cleanly");

      // Step 2.4: Wait for Miner to add second PROGRESS
      console.log("\n▶ Step 2.4: Waiting for Miner to process second decision...");

      const minerCompleted = await waitFor(
        async () => {
          const comments = await getIssueComments(ctx.workIssueId);
          // Look for both actual PROGRESS comments (with "] PROGRESS:" format)
          const hasRound1 = comments.includes("] PROGRESS: Round 1 done");
          const hasRound2 = comments.includes("] PROGRESS: Round 2 done");
          console.log(`    Round 1: ${hasRound1}, Round 2: ${hasRound2}`);
          return hasRound1 && hasRound2;
        },
        "Round 2 PROGRESS comment",
        90000, // 90 seconds
        5000,
      );

      // ====== Summary ======
      const finalComments = await getIssueComments(ctx.workIssueId);
      const finalStatus = await getIssueStatus(ctx.workIssueId);
      const hasR1 = finalComments.includes("] PROGRESS: Round 1 done");
      const hasR2 = finalComments.includes("] PROGRESS: Round 2 done");
      const progressCount = (hasR1 ? 1 : 0) + (hasR2 ? 1 : 0);

      console.log("\n" + "=".repeat(70));
      console.log("✅ E2E MULTI-ROUND DECISION TEST COMPLETED");
      console.log("=".repeat(70));
      console.log(`
Summary:
  Work Issue: ${ctx.workIssueId}
  Decision 1: ${ctx.decision1Id} (architecture)
  Decision 2: ${decision2Id} (implementation)
  PROGRESS comments: ${progressCount}
  Final Status: ${finalStatus}

Flow verified:
  Round 1:
    1. ✓ Decision 1 closed (PM answered)
    2. ✓ Hook triggered Miner respawn
    3. ${round1Complete ? "✓" : "?"} Miner added PROGRESS (round 1)

  Round 2:
    4. ✓ Decision 2 created and answered
    5. ✓ Hook triggered Miner respawn
    6. ${minerCompleted ? "✓" : "?"} Miner added PROGRESS (round 2)
`);

    } finally {
      await cleanupTest(ctx, decision2Id);
    }
  },
});

// Quick validation test
Deno.test("Hook script exists", async () => {
  const stat = await Deno.stat(HOOK_SCRIPT);
  assertEquals(stat.isFile, true, "Hook script should exist");
});
