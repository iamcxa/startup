// tests/e2e/real-implementation.test.ts
// E2E test for real implementation tasks
//
// Stage 1: Simple text file creation + git commit
// Stage 2: TypeScript function implementation (future)
//
// Run with: RUN_E2E_TESTS=1 deno test tests/e2e/real-implementation.test.ts --allow-all
//
// WARNING: This test spawns real Claude agents and creates files/commits!

import { assertEquals, assertStringIncludes } from "@std/assert";

const WORK_DIR = Deno.cwd();
const STARTUP_BIN = `${WORK_DIR}/scripts/startup-dev.sh`;
const HOOK_SCRIPT = `${WORK_DIR}/hooks/post-tool-use.sh`;

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
 * Check if file was committed in latest commit
 */
async function isFileInLatestCommit(filePath: string): Promise<boolean> {
  const cmd = new Deno.Command("git", {
    args: ["show", "--name-only", "--format=", "HEAD"],
    cwd: WORK_DIR,
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout } = await cmd.output();
  const files = new TextDecoder().decode(stdout);
  return files.includes(filePath);
}

/**
 * Setup: Create work issue and decision
 */
async function setupStage1Test(): Promise<TestContext> {
  console.log("\n▶ Setup: Creating work issue and decision...");

  // Create work issue
  const workResult = await bd([
    "create",
    "--title", "E2E Real Impl Stage 1: Create hello.txt",
    "--type", "task",
    "--label", "e2e-real-impl",
    "--description", "Create a simple text file and commit it",
  ]);
  const workIssueId = extractIssueId(workResult.stdout);
  if (!workIssueId) {
    throw new Error(`Failed to create work issue: ${workResult.stdout}`);
  }
  console.log(`  ✓ Work issue: ${workIssueId}`);

  // Create decision issue
  const decisionResult = await bd([
    "create",
    "--title", "DECISION: What text should hello.txt contain?",
    "--type", "task",
    "--label", "pd:decision",
    "--label", "e2e-real-impl",
    "--description", "We need to decide the greeting message",
  ]);
  const decisionIssueId = extractIssueId(decisionResult.stdout);
  if (!decisionIssueId) {
    throw new Error(`Failed to create decision: ${decisionResult.stdout}`);
  }
  console.log(`  ✓ Decision issue: ${decisionIssueId}`);

  // Add dependency: work depends on decision
  await bd(["dep", "add", workIssueId, decisionIssueId]);
  console.log(`  ✓ Dependency added`);

  // Add BLOCKED comment with clear resume-task
  await bd([
    "comments", "add", workIssueId,
    `BLOCKED: waiting for ${decisionIssueId} | resume-task: Read decision from ${decisionIssueId}. Run 'mkdir -p src && echo "Hello from Miner" > src/hello.txt && git add src/hello.txt && git commit -m "test: add hello.txt"'. Add PROGRESS comment to ${workIssueId}.`,
  ]);
  console.log(`  ✓ BLOCKED comment added`);

  // Add PM answer to decision
  await bd([
    "comments", "add", decisionIssueId,
    `ANSWER [high]: Use "Hello from Miner" as the greeting message.

Reasoning: Simple and clear for testing purposes.
Source: Test requirements`,
  ]);
  console.log(`  ✓ PM answer added`);

  return { workIssueId, decisionIssueId };
}

/**
 * Cleanup test artifacts
 */
async function cleanupStage1Test(ctx: TestContext): Promise<void> {
  console.log("\n▶ Cleanup...");

  // Close issues
  await bd(["close", ctx.workIssueId, ctx.decisionIssueId]).catch(() => {});

  // Kill tmux session
  await killTmuxSession(`startup-${ctx.workIssueId}`).catch(() => {});

  // Remove test file if exists
  try {
    await Deno.remove("src/hello.txt");
    console.log("  ✓ Removed src/hello.txt");
  } catch {
    // File might not exist
  }

  // Revert commit if it was created
  try {
    const isCommitted = await isFileInLatestCommit("src/hello.txt");
    if (isCommitted) {
      const cmd = new Deno.Command("git", {
        args: ["reset", "--soft", "HEAD~1"],
        cwd: WORK_DIR,
      });
      await cmd.output();
      console.log("  ✓ Reverted test commit");
    }
  } catch {
    // Commit might not exist
  }
}

// ============================================================================
// Tests
// ============================================================================

Deno.test({
  name: "E2E Stage 1: Miner creates text file and commits",
  ignore: Deno.env.get("RUN_E2E_TESTS") !== "1",
  async fn() {
    console.log("\n" + "=".repeat(70));
    console.log("E2E TEST: Real Implementation Stage 1");
    console.log("=".repeat(70));

    const ctx = await setupStage1Test();

    try {
      // ====== Step 1: Close decision (simulating PM) ======
      console.log("\n▶ Step 1: Closing decision (simulating PM)...");
      await bd(["close", ctx.decisionIssueId, "--reason", "Greeting message decided"]);
      const decisionStatus = await getIssueStatus(ctx.decisionIssueId);
      assertEquals(decisionStatus, "closed", "Decision should be closed");
      console.log("  ✓ Decision closed");

      // ====== Step 2: Trigger hook ======
      console.log("\n▶ Step 2: Triggering Hook...");
      const hookResult = await triggerHookForDecisionClose(ctx.decisionIssueId);
      console.log(`  Hook exit code: ${hookResult.code}`);
      console.log(`  Hook output: ${hookResult.stdout}`);
      assertEquals(hookResult.code, 0, "Hook should exit cleanly");

      // ====== Step 3: Wait for Miner respawn ======
      console.log("\n▶ Step 3: Waiting for Miner respawn...");
      const minerSession = `startup-${ctx.workIssueId}`;
      const minerRespawned = await waitFor(
        () => tmuxSessionExists(minerSession),
        `Miner session ${minerSession} exists`,
        30000,
        2000,
      );
      assertEquals(minerRespawned, true, "Miner should respawn");
      console.log("  ✓ Miner respawned");

      // ====== Step 4: Wait for file creation ======
      console.log("\n▶ Step 4: Waiting for file creation...");
      const fileCreated = await waitFor(
        async () => {
          try {
            await Deno.stat("src/hello.txt");
            return true;
          } catch {
            return false;
          }
        },
        "src/hello.txt exists",
        120000, // 2 minutes
        5000,
      );

      assertEquals(fileCreated, true, "src/hello.txt should be created");
      console.log("  ✓ File created");

      // ====== Step 5: Verify file content ======
      console.log("\n▶ Step 5: Verifying file content...");
      const content = await Deno.readTextFile("src/hello.txt");
      console.log(`  File content: "${content.trim()}"`);
      assertStringIncludes(content, "Hello from Miner", "Content should match");
      console.log("  ✓ Content correct");

      // ====== Step 6: Wait for git commit ======
      console.log("\n▶ Step 6: Waiting for git commit...");
      const fileCommitted = await waitFor(
        () => isFileInLatestCommit("src/hello.txt"),
        "src/hello.txt committed",
        60000, // 1 minute
        5000,
      );

      assertEquals(fileCommitted, true, "File should be committed");

      // Verify commit message
      const cmd = new Deno.Command("git", {
        args: ["log", "-1", "--oneline"],
        cwd: WORK_DIR,
        stdout: "piped",
      });
      const { stdout } = await cmd.output();
      const commitMsg = new TextDecoder().decode(stdout);
      console.log(`  Latest commit: ${commitMsg.trim()}`);
      assertStringIncludes(commitMsg, "hello.txt", "Commit should mention hello.txt");
      console.log("  ✓ File committed");

      // ====== Step 7: Wait for PROGRESS comment ======
      console.log("\n▶ Step 7: Waiting for PROGRESS comment...");
      const progressAdded = await waitFor(
        async () => {
          const comments = await getIssueComments(ctx.workIssueId);
          return comments.includes("] PROGRESS:");
        },
        "PROGRESS comment added",
        60000,
        5000,
      );

      assertEquals(progressAdded, true, "PROGRESS comment should be added");
      const finalComments = await getIssueComments(ctx.workIssueId);
      console.log(`  Comments:\n${finalComments.split("\n").map(l => "    " + l).join("\n")}`);

      // ====== Summary ======
      console.log("\n" + "=".repeat(70));
      console.log("✅ STAGE 1 TEST COMPLETED");
      console.log("=".repeat(70));
      console.log(`
Summary:
  Work Issue: ${ctx.workIssueId}
  Decision Issue: ${ctx.decisionIssueId}

Verified:
  ✓ File created: src/hello.txt
  ✓ Content correct: "Hello from Miner"
  ✓ Git committed: yes
  ✓ PROGRESS comment: yes

Flow verified:
  1. ✓ Decision closed (PM answered)
  2. ✓ Hook triggered Miner respawn
  3. ✓ Miner created file
  4. ✓ Miner committed to git
  5. ✓ Miner added PROGRESS comment
`);
    } finally {
      await cleanupStage1Test(ctx);
    }
  },
});

// ============================================================================
// Stage 2: TypeScript Function Implementation
// ============================================================================

/**
 * Setup: Create work issue and decision for Stage 2
 */
async function setupStage2Test(): Promise<TestContext> {
  console.log("\n▶ Setup: Creating work issue and decision...");

  // Create work issue
  const workResult = await bd([
    "create",
    "--title", "E2E Real Impl Stage 2: Create greet function",
    "--type", "task",
    "--label", "e2e-real-impl-s2",
    "--description", "Create a TypeScript function to greet users",
  ]);
  const workIssueId = extractIssueId(workResult.stdout);
  if (!workIssueId) {
    throw new Error(`Failed to create work issue: ${workResult.stdout}`);
  }
  console.log(`  ✓ Work issue: ${workIssueId}`);

  // Create decision issue
  const decisionResult = await bd([
    "create",
    "--title", "DECISION: What greeting format to use?",
    "--type", "task",
    "--label", "pd:decision",
    "--label", "e2e-real-impl-s2",
    "--description", "Decide the greeting message format",
  ]);
  const decisionIssueId = extractIssueId(decisionResult.stdout);
  if (!decisionIssueId) {
    throw new Error(`Failed to create decision: ${decisionResult.stdout}`);
  }
  console.log(`  ✓ Decision issue: ${decisionIssueId}`);

  // Add dependency
  await bd(["dep", "add", workIssueId, decisionIssueId]);
  console.log(`  ✓ Dependency added`);

  // Add BLOCKED comment with TypeScript implementation task
  await bd([
    "comments", "add", workIssueId,
    `BLOCKED: waiting for ${decisionIssueId} | resume-task: Read decision from ${decisionIssueId}. Create src/greet.ts with TypeScript function 'export function greet(name: string): string' that returns greeting. Use format from decision. Commit with 'git add src/greet.ts && git commit -m "feat: add greet function"'. Add PROGRESS to ${workIssueId}.`,
  ]);
  console.log(`  ✓ BLOCKED comment added`);

  // Add PM answer
  await bd([
    "comments", "add", decisionIssueId,
    `ANSWER [high]: Use format "Hello, {name}!" for the greeting.

Reasoning: Professional and friendly tone.
Source: Best practices`,
  ]);
  console.log(`  ✓ PM answer added`);

  return { workIssueId, decisionIssueId };
}

/**
 * Cleanup Stage 2 test artifacts
 */
async function cleanupStage2Test(ctx: TestContext): Promise<void> {
  console.log("\n▶ Cleanup...");

  // Close issues
  await bd(["close", ctx.workIssueId, ctx.decisionIssueId]).catch(() => {});

  // Kill tmux session
  await killTmuxSession(`startup-${ctx.workIssueId}`).catch(() => {});

  // Remove test file
  try {
    await Deno.remove("src/greet.ts");
    console.log("  ✓ Removed src/greet.ts");
  } catch {
    // File might not exist
  }

  // Revert commit if exists
  try {
    const isCommitted = await isFileInLatestCommit("src/greet.ts");
    if (isCommitted) {
      const cmd = new Deno.Command("git", {
        args: ["reset", "--soft", "HEAD~1"],
        cwd: WORK_DIR,
      });
      await cmd.output();
      console.log("  ✓ Reverted test commit");
    }
  } catch {
    // Commit might not exist
  }
}

Deno.test({
  name: "E2E Stage 2: Miner implements TypeScript function",
  ignore: Deno.env.get("RUN_E2E_TESTS") !== "1",
  async fn() {
    console.log("\n" + "=".repeat(70));
    console.log("E2E TEST: Real Implementation Stage 2 (TypeScript)");
    console.log("=".repeat(70));

    const ctx = await setupStage2Test();

    try {
      // ====== Step 1: Close decision ======
      console.log("\n▶ Step 1: Closing decision (simulating PM)...");
      await bd(["close", ctx.decisionIssueId, "--reason", "Greeting format decided"]);
      const decisionStatus = await getIssueStatus(ctx.decisionIssueId);
      assertEquals(decisionStatus, "closed", "Decision should be closed");
      console.log("  ✓ Decision closed");

      // ====== Step 2: Trigger hook ======
      console.log("\n▶ Step 2: Triggering Hook...");
      const hookResult = await triggerHookForDecisionClose(ctx.decisionIssueId);
      console.log(`  Hook exit code: ${hookResult.code}`);
      assertEquals(hookResult.code, 0, "Hook should exit cleanly");

      // ====== Step 3: Wait for Miner respawn ======
      console.log("\n▶ Step 3: Waiting for Miner respawn...");
      const minerSession = `startup-${ctx.workIssueId}`;
      const minerRespawned = await waitFor(
        () => tmuxSessionExists(minerSession),
        `Miner session ${minerSession} exists`,
        30000,
        2000,
      );
      assertEquals(minerRespawned, true, "Miner should respawn");
      console.log("  ✓ Miner respawned");

      // ====== Step 4: Wait for file creation ======
      console.log("\n▶ Step 4: Waiting for TypeScript file creation...");
      const fileCreated = await waitFor(
        async () => {
          try {
            await Deno.stat("src/greet.ts");
            return true;
          } catch {
            return false;
          }
        },
        "src/greet.ts exists",
        150000, // 2.5 minutes (TypeScript might take longer)
        5000,
      );

      assertEquals(fileCreated, true, "src/greet.ts should be created");
      console.log("  ✓ File created");

      // ====== Step 5: Verify TypeScript content ======
      console.log("\n▶ Step 5: Verifying TypeScript content...");
      const content = await Deno.readTextFile("src/greet.ts");
      console.log(`  File content:\n${content.split("\n").map(l => "    " + l).join("\n")}`);

      // Check for TypeScript syntax
      assertStringIncludes(content, "function greet", "Should have greet function");
      assertStringIncludes(content, "name: string", "Should have type annotation for parameter");
      assertStringIncludes(content, ": string", "Should have return type annotation");
      assertStringIncludes(content, "return", "Should have return statement");

      // Check it doesn't use 'any' type
      assertEquals(content.includes("any"), false, "Should not use 'any' type");

      console.log("  ✓ TypeScript syntax correct");

      // ====== Step 6: Wait for git commit ======
      console.log("\n▶ Step 6: Waiting for git commit...");
      const fileCommitted = await waitFor(
        () => isFileInLatestCommit("src/greet.ts"),
        "src/greet.ts committed",
        60000,
        5000,
      );

      assertEquals(fileCommitted, true, "File should be committed");

      // Verify commit message
      const cmd = new Deno.Command("git", {
        args: ["log", "-1", "--oneline"],
        cwd: WORK_DIR,
        stdout: "piped",
      });
      const { stdout } = await cmd.output();
      const commitMsg = new TextDecoder().decode(stdout);
      console.log(`  Latest commit: ${commitMsg.trim()}`);
      assertStringIncludes(commitMsg, "greet", "Commit should mention greet");
      console.log("  ✓ File committed");

      // ====== Step 7: Wait for PROGRESS comment ======
      console.log("\n▶ Step 7: Waiting for PROGRESS comment...");
      const progressAdded = await waitFor(
        async () => {
          const comments = await getIssueComments(ctx.workIssueId);
          return comments.includes("] PROGRESS:");
        },
        "PROGRESS comment added",
        60000,
        5000,
      );

      assertEquals(progressAdded, true, "PROGRESS comment should be added");
      const finalComments = await getIssueComments(ctx.workIssueId);
      console.log(`  Comments:\n${finalComments.split("\n").map(l => "    " + l).join("\n")}`);

      // ====== Summary ======
      console.log("\n" + "=".repeat(70));
      console.log("✅ STAGE 2 TEST COMPLETED");
      console.log("=".repeat(70));
      console.log(`
Summary:
  Work Issue: ${ctx.workIssueId}
  Decision Issue: ${ctx.decisionIssueId}

Verified:
  ✓ File created: src/greet.ts
  ✓ TypeScript syntax: function with types
  ✓ Type annotations: name: string, returns string
  ✓ No 'any' types: clean TypeScript
  ✓ Git committed: yes
  ✓ PROGRESS comment: yes

Flow verified:
  1. ✓ Decision closed (PM answered)
  2. ✓ Hook triggered Miner respawn
  3. ✓ Miner created TypeScript file
  4. ✓ Miner used proper type annotations
  5. ✓ Miner committed to git
  6. ✓ Miner added PROGRESS comment
`);
    } finally {
      await cleanupStage2Test(ctx);
    }
  },
});

// Quick validation test
Deno.test("Hook script exists", async () => {
  const stat = await Deno.stat(HOOK_SCRIPT);
  assertEquals(stat.isFile, true, "Hook script should exist");
});
