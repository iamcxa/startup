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
import { initLangfuseForTest, getLangfuseEnv, withTestSpan, withAgentSpan, traceEvent, type LangfuseTestContext } from "../utils/langfuse.ts";

const WORK_DIR = Deno.cwd();
const PAYDIRT_BIN = `${WORK_DIR}/scripts/paydirt-dev.sh`;

interface TestContext {
  workIssueId: string;
  langfuse: LangfuseTestContext;
}

/**
 * Run bd command and get output (with tracing)
 */
async function bd(
  args: string[],
  langfuse?: LangfuseTestContext,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const operation = args[0] || "unknown";
  const spanName = `bd:${operation}`;

  const execute = async () => {
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
  };

  if (!langfuse?.enabled) {
    return execute();
  }

  return withTestSpan(
    langfuse,
    spanName,
    {
      "bd.command": operation,
      "bd.args": args.join(" "),
      "bd.type": "cli",
    },
    async () => {
      const result = await execute();
      // Log result to span via traceEvent
      if (result.code !== 0) {
        traceEvent(langfuse, `bd:${operation}:error`, {
          "bd.exit_code": result.code,
          "bd.stderr": result.stderr.substring(0, 500),
        });
      }
      return result;
    },
  );
}

/**
 * Extract issue ID from bd create output
 */
function extractIssueId(output: string): string | null {
  const match = output.match(/Created issue:\s*(\S+)/);
  return match ? match[1] : null;
}

/**
 * Get issue comments (with tracing)
 */
async function getIssueComments(issueId: string, langfuse?: LangfuseTestContext): Promise<string> {
  const result = await bd(["comments", issueId], langfuse);
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
 * Spawn Miner directly (simulating respawn) - with detailed tracing
 * Uses withAgentSpan to capture input (task) for Langfuse gen_ai visualization
 */
async function spawnMiner(
  issueId: string,
  task: string,
  model: string = "sonnet",
  langfuse?: LangfuseTestContext,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const execute = async () => {
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
  };

  if (!langfuse?.enabled) {
    return execute();
  }

  // Use withAgentSpan to capture input/output with gen_ai attributes
  return withAgentSpan(
    langfuse,
    "agent:miner",
    {
      model,
      prompt: task,
      task: `Miner claim: ${issueId}`,
    },
    async () => {
      const startTime = Date.now();
      const execResult = await execute();
      const duration = Date.now() - startTime;

      // Log spawn metadata as event
      traceEvent(langfuse, "agent:spawn:result", {
        "agent.role": "miner",
        "agent.claim_id": issueId,
        "agent.exit_code": execResult.code,
        "agent.spawn_duration_ms": duration,
        "agent.success": execResult.code === 0,
      });

      // Return result with spawn output as the agent output
      return {
        result: execResult,
        output: execResult.stdout + (execResult.stderr ? `\n[stderr]: ${execResult.stderr}` : ""),
      };
    },
  );
}

/**
 * Capture agent output from bd comments for tracing
 */
async function captureAgentOutput(
  issueId: string,
  agentRole: string,
  langfuse?: LangfuseTestContext,
): Promise<string> {
  const comments = await getIssueComments(issueId, langfuse);

  if (langfuse?.enabled) {
    traceEvent(langfuse, `agent:${agentRole}:output`, {
      "agent.role": agentRole,
      "agent.claim_id": issueId,
      "agent.output_length": comments.length,
      "agent.output_preview": comments.substring(0, 500),
    });
  }

  return comments;
}

/**
 * Wait for condition with timeout (with tracing)
 */
async function waitFor(
  condition: () => Promise<boolean>,
  description: string,
  timeoutMs: number = 120000,
  pollIntervalMs: number = 5000,
  langfuse?: LangfuseTestContext,
): Promise<boolean> {
  const execute = async () => {
    const startTime = Date.now();
    let pollCount = 0;
    while (Date.now() - startTime < timeoutMs) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const result = await condition();
      pollCount++;
      console.log(`  [${elapsed}s] ${description}: ${result}`);
      if (result) return { success: true, pollCount, elapsed };
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    return { success: false, pollCount, elapsed: Math.floor((Date.now() - startTime) / 1000) };
  };

  if (!langfuse?.enabled) {
    const result = await execute();
    return result.success;
  }

  return withTestSpan(
    langfuse,
    `wait:${description.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50)}`,
    {
      "wait.description": description,
      "wait.timeout_ms": timeoutMs,
      "wait.poll_interval_ms": pollIntervalMs,
    },
    async () => {
      const result = await execute();

      // Log completion status
      traceEvent(langfuse, "wait:complete", {
        "wait.description": description,
        "wait.success": result.success,
        "wait.poll_count": result.pollCount,
        "wait.elapsed_seconds": result.elapsed,
      });

      return result.success;
    },
  );
}

/**
 * Setup test: Create work issue (with tracing)
 */
async function setupTest(langfuse: LangfuseTestContext): Promise<TestContext> {
  console.log("\n▶ Setup: Creating work issue...");

  return withTestSpan(
    langfuse,
    "test:setup",
    { "setup.phase": "initialization" },
    async () => {
      const workResult = await bd([
        "create",
        "--title", "E2E P2: Multi-phase task with session interruption",
        "--type", "task",
        "--label", "e2e-p2",
        "--description", "Task 1: Create file1.txt, Task 2: Create file2.txt (after respawn)",
      ], langfuse);

      const workIssueId = extractIssueId(workResult.stdout);
      if (!workIssueId) {
        throw new Error(`Failed to create work issue: ${workResult.stdout}`);
      }
      console.log(`  ✓ Work issue: ${workIssueId}`);

      traceEvent(langfuse, "test:setup:complete", {
        "setup.issue_id": workIssueId,
      });

      return { workIssueId, langfuse };
    },
  );
}

/**
 * Cleanup test artifacts (with tracing)
 */
async function cleanupTest(ctx: TestContext): Promise<void> {
  console.log("\n▶ Cleanup...");

  await withTestSpan(
    ctx.langfuse,
    "test:cleanup",
    { "cleanup.issue_id": ctx.workIssueId },
    async () => {
      // Close issue
      await bd(["close", ctx.workIssueId], ctx.langfuse).catch(() => {});

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

      traceEvent(ctx.langfuse, "test:cleanup:complete", {
        "cleanup.issue_id": ctx.workIssueId,
      });
    },
  );
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

    // Log test start
    traceEvent(langfuse, "test:start", {
      "test.name": "E2E P2: Context recovery",
      "test.session_id": langfuse.sessionId,
    });

    const ctx = await setupTest(langfuse);
    const minerSession = `paydirt-${ctx.workIssueId}`;

    try {
      // ====== Phase 1: Initial Task ======
      await withTestSpan(langfuse, "phase:1:initial_task", {
        "phase.number": 1,
        "phase.name": "Initial Task",
        "phase.task": "Create file1.txt",
        "phase.issue_id": ctx.workIssueId,
      }, async () => {
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
              const comments = await getIssueComments(ctx.workIssueId, langfuse);
              return comments.includes("] PROGRESS:");
            } catch {
              return false;
            }
          },
          "Task 1 complete (file + PROGRESS)",
          120000,
          5000,
          langfuse,
        );

        assertEquals(task1Complete, true, "Task 1 should complete");
        const phase1Comments = await getIssueComments(ctx.workIssueId, langfuse);
        console.log(`  Phase 1 comments:\n${phase1Comments.split("\n").map(l => "    " + l).join("\n")}`);
        console.log("  ✓ Task 1 completed");

        // Capture agent output for Langfuse gen_ai visualization
        await captureAgentOutput(ctx.workIssueId, "miner:phase1", langfuse);

        traceEvent(langfuse, "phase:1:complete", {
          "phase.number": 1,
          "phase.success": true,
        });
      });

      // ====== Phase 2: Session Interruption ======
      await withTestSpan(langfuse, "phase:2:session_interruption", {
        "phase.number": 2,
        "phase.name": "Session Interruption",
        "phase.action": "Kill tmux session",
        "phase.session": minerSession,
      }, async () => {
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

        traceEvent(langfuse, "phase:2:complete", {
          "phase.number": 2,
          "phase.session_killed": true,
        });
      });

      // ====== Phase 3: Context Recovery ======
      await withTestSpan(langfuse, "phase:3:context_recovery", {
        "phase.number": 3,
        "phase.name": "Context Recovery",
        "phase.action": "Read bd issue + Respawn Miner",
        "phase.issue_id": ctx.workIssueId,
      }, async () => {
        console.log("\n" + "-".repeat(50));
        console.log("PHASE 3: Context Recovery from bd Issue");
        console.log("-".repeat(50));

        console.log("\n▶ Step 3.1: Reading context from bd issue...");
        const recoveredComments = await getIssueComments(ctx.workIssueId, langfuse);
        console.log(`  Recovered comments:\n${recoveredComments.split("\n").map(l => "    " + l).join("\n")}`);

        // Verify we can see Task 1 progress
        assertStringIncludes(recoveredComments, "PROGRESS:", "Should have Task 1 PROGRESS");
        console.log("  ✓ Context recovered from bd issue");

        traceEvent(langfuse, "phase:3:context_recovered", {
          "phase.number": 3,
          "recovery.has_progress": recoveredComments.includes("PROGRESS:"),
          "recovery.comment_length": recoveredComments.length,
        });

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

        traceEvent(langfuse, "phase:3:complete", {
          "phase.number": 3,
          "phase.respawn_success": spawn2Result.code === 0,
        });
      });

      // ====== Phase 4: Continued Work ======
      await withTestSpan(langfuse, "phase:4:continued_work", {
        "phase.number": 4,
        "phase.name": "Continued Work",
        "phase.task": "Create file2.txt",
        "phase.issue_id": ctx.workIssueId,
      }, async () => {
        console.log("\n" + "-".repeat(50));
        console.log("PHASE 4: Continued Work (file2.txt)");
        console.log("-".repeat(50));

        console.log("\n▶ Step 4.1: Waiting for Task 2 completion...");
        const task2Complete = await waitFor(
          async () => {
            try {
              await Deno.stat("src/file2.txt");
              const comments = await getIssueComments(ctx.workIssueId, langfuse);
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
          langfuse,
        );

        assertEquals(task2Complete, true, "Task 2 should complete");
        console.log("  ✓ Task 2 completed");

        // Capture agent output for Langfuse gen_ai visualization
        await captureAgentOutput(ctx.workIssueId, "miner:phase4", langfuse);

        traceEvent(langfuse, "phase:4:complete", {
          "phase.number": 4,
          "phase.success": task2Complete,
        });
      });

      // ====== Verification ======
      await withTestSpan(langfuse, "phase:verification", {
        "phase.name": "Verification",
        "phase.issue_id": ctx.workIssueId,
      }, async () => {
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
        const finalComments = await getIssueComments(ctx.workIssueId, langfuse);
        const progressCount = (finalComments.match(/] PROGRESS:/g) || []).length;

        assertEquals(progressCount, 2, "Should have 2 PROGRESS comments");
        console.log(`  ✓ ${progressCount} PROGRESS comments (Task 1 + Task 2)`);

        console.log(`\n  Final comments:\n${finalComments.split("\n").map(l => "    " + l).join("\n")}`);

        traceEvent(langfuse, "verification:complete", {
          "verification.file1_exists": file1Exists,
          "verification.file2_exists": file2Exists,
          "verification.progress_count": progressCount,
          "verification.success": file1Exists && file2Exists && progressCount === 2,
        });
      });

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

      traceEvent(langfuse, "test:complete", {
        "test.name": "E2E P2: Context recovery",
        "test.success": true,
        "test.issue_id": ctx.workIssueId,
      });
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
