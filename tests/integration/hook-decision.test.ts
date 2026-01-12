// tests/integration/hook-decision.test.ts
// Integration test for PostToolUse hook pd:decision handling
//
// Tests the shell script hooks/post-tool-use.sh correctly:
// 1. Spawns PM Agent when bd create --label pd:decision is detected
// 2. Respawns Miner when bd close is detected on a pd:decision issue
//
// Run with: deno test tests/integration/hook-decision.test.ts --allow-all

import { assertEquals, assertStringIncludes } from "@std/assert";

const WORK_DIR = Deno.cwd();
const HOOK_SCRIPT = `${WORK_DIR}/hooks/post-tool-use.sh`;

interface HookTestResult {
  stdout: string;
  stderr: string;
  code: number;
  capturedCommands: string[];
}

/**
 * Create a mock startup binary that captures commands instead of executing them
 */
async function createMockStartup(tempDir: string): Promise<string> {
  const mockBin = `${tempDir}/mock-startup`;
  const logFile = `${tempDir}/commands.log`;

  // Create mock script that logs commands
  const mockScript = `#!/bin/bash
echo "$@" >> "${logFile}"
echo "Mock executed: $@"
`;

  await Deno.writeTextFile(mockBin, mockScript);
  await Deno.chmod(mockBin, 0o755);

  return mockBin;
}

/**
 * Run the hook script with specified environment and input
 */
async function runHook(
  env: Record<string, string>,
  stdin: string = "",
): Promise<HookTestResult> {
  const tempDir = await Deno.makeTempDir({ prefix: "hook-test-" });

  try {
    const mockBin = await createMockStartup(tempDir);
    const logFile = `${tempDir}/commands.log`;

    // Ensure log file exists
    await Deno.writeTextFile(logFile, "");

    const cmd = new Deno.Command("bash", {
      args: [HOOK_SCRIPT],
      cwd: WORK_DIR,
      env: {
        ...Deno.env.toObject(),
        ...env,
        STARTUP_BIN: mockBin,
        STARTUP_HOOK_SYNC: "1", // Run synchronously for testing
      },
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    });

    const process = cmd.spawn();

    // Write stdin
    const writer = process.stdin.getWriter();
    await writer.write(new TextEncoder().encode(stdin));
    await writer.close();

    const { stdout, stderr, code } = await process.output();

    // Read captured commands
    const capturedCommands = (await Deno.readTextFile(logFile))
      .split("\n")
      .filter((line) => line.trim() !== "");

    return {
      stdout: new TextDecoder().decode(stdout),
      stderr: new TextDecoder().decode(stderr),
      code,
      capturedCommands,
    };
  } finally {
    // Cleanup temp dir
    await Deno.remove(tempDir, { recursive: true });
  }
}

// ============================================================================
// Decision Issue Creation Detection Tests
// ============================================================================

Deno.test("Hook spawns PM when bd create pd:decision detected", async () => {
  const result = await runHook({
    CLAUDE_TOOL_INPUT: 'bd create --title "DECISION: OAuth vs JWT" --type task --label pd:decision --priority 1',
    CLAUDE_TOOL_OUTPUT: "Created issue: beads-dec123",
    STARTUP_BD: "beads-work456",
    STARTUP_ROLE: "miner",
  });

  assertEquals(result.code, 0, "Hook should exit cleanly");
  assertEquals(result.capturedCommands.length, 1, "Should capture one command");
  assertStringIncludes(
    result.capturedCommands[0],
    "call pm",
    "Should spawn PM agent",
  );
  assertStringIncludes(
    result.capturedCommands[0],
    "--claim beads-dec123",
    "Should pass decision issue ID",
  );
});

Deno.test("Hook spawns PM with --label=pd:decision syntax", async () => {
  const result = await runHook({
    CLAUDE_TOOL_INPUT: 'bd create --title "DECISION: X" --label=pd:decision',
    CLAUDE_TOOL_OUTPUT: "Created issue: beads-xyz789",
    STARTUP_BD: "beads-work123",
  });

  assertEquals(result.code, 0);
  assertEquals(result.capturedCommands.length, 1);
  assertStringIncludes(result.capturedCommands[0], "call pm");
  assertStringIncludes(result.capturedCommands[0], "--claim beads-xyz789");
});

Deno.test("Hook does NOT spawn PM for non-decision labels", async () => {
  const result = await runHook({
    CLAUDE_TOOL_INPUT: 'bd create --title "Regular task" --type task --label pd:task',
    CLAUDE_TOOL_OUTPUT: "Created issue: beads-task111",
    STARTUP_BD: "beads-work123",
  });

  assertEquals(result.code, 0);
  assertEquals(
    result.capturedCommands.length,
    0,
    "Should NOT spawn any agent for non-decision label",
  );
});

Deno.test("Hook does NOT spawn PM without STARTUP_BIN", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "hook-test-nobin-" });

  try {
    const cmd = new Deno.Command("bash", {
      args: [HOOK_SCRIPT],
      cwd: WORK_DIR,
      env: {
        CLAUDE_TOOL_INPUT: 'bd create --label pd:decision --title "X"',
        CLAUDE_TOOL_OUTPUT: "Created issue: beads-dec123",
        // No STARTUP_BIN set
      },
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    });

    const process = cmd.spawn();
    const writer = process.stdin.getWriter();
    await writer.close();
    const { code } = await process.output();

    assertEquals(code, 0, "Hook should exit cleanly without STARTUP_BIN");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Decision Close Detection Tests
// ============================================================================

Deno.test("Hook respawns Miner when pd:decision closed (with real bd)", async () => {
  // This test requires a real bd issue to exist
  // Create test issues, then test the hook

  // Step 1: Create a work issue
  const workResult = await new Deno.Command("bd", {
    args: ["create", "--title", "Hook Test: Work issue", "--type", "task", "--label", "hook-test"],
    cwd: WORK_DIR,
    stdout: "piped",
    stderr: "piped",
  }).output();

  const workOutput = new TextDecoder().decode(workResult.stdout);
  const workMatch = workOutput.match(/Created issue:\s*(\S+)/);
  if (!workMatch) {
    throw new Error(`Failed to create work issue: ${workOutput}`);
  }
  const workIssueId = workMatch[1];

  try {
    // Step 2: Create a decision issue
    const decisionResult = await new Deno.Command("bd", {
      args: [
        "create",
        "--title", "DECISION: Hook test decision",
        "--type", "task",
        "--label", "pd:decision",
        "--label", "hook-test",
      ],
      cwd: WORK_DIR,
      stdout: "piped",
      stderr: "piped",
    }).output();

    const decisionOutput = new TextDecoder().decode(decisionResult.stdout);
    const decisionMatch = decisionOutput.match(/Created issue:\s*(\S+)/);
    if (!decisionMatch) {
      throw new Error(`Failed to create decision issue: ${decisionOutput}`);
    }
    const decisionIssueId = decisionMatch[1];

    try {
      // Step 3: Add dependency (work depends on decision)
      await new Deno.Command("bd", {
        args: ["dep", "add", workIssueId, decisionIssueId],
        cwd: WORK_DIR,
        stdout: "piped",
        stderr: "piped",
      }).output();

      // Step 4: Add blocked comment to work issue
      await new Deno.Command("bd", {
        args: [
          "comments", "add", workIssueId,
          `BLOCKED: waiting for ${decisionIssueId}\nresume-task: Continue hook testing`,
        ],
        cwd: WORK_DIR,
        stdout: "piped",
        stderr: "piped",
      }).output();

      // Step 5: Run hook simulating bd close on the decision
      const result = await runHook({
        CLAUDE_TOOL_INPUT: `bd close ${decisionIssueId} --reason "Decision made"`,
        CLAUDE_TOOL_OUTPUT: `Closed issue: ${decisionIssueId}`,
        STARTUP_BD: workIssueId,
        STARTUP_ROLE: "pm",
      });

      assertEquals(result.code, 0, "Hook should exit cleanly");
      assertEquals(result.capturedCommands.length, 1, "Should capture miner respawn command");
      assertStringIncludes(
        result.capturedCommands[0],
        "call miner",
        "Should respawn miner",
      );
      assertStringIncludes(
        result.capturedCommands[0],
        `--claim ${workIssueId}`,
        "Should pass blocked work issue ID",
      );
      assertStringIncludes(
        result.capturedCommands[0],
        "--task",
        "Should include task argument",
      );

    } finally {
      // Cleanup: close decision issue
      await new Deno.Command("bd", {
        args: ["close", decisionIssueId, "--reason", "Hook test cleanup"],
        cwd: WORK_DIR,
        stdout: "piped",
        stderr: "piped",
      }).output().catch(() => {});
    }
  } finally {
    // Cleanup: close work issue
    await new Deno.Command("bd", {
      args: ["close", workIssueId, "--reason", "Hook test cleanup"],
      cwd: WORK_DIR,
      stdout: "piped",
      stderr: "piped",
    }).output().catch(() => {});
  }
});

Deno.test("Hook does NOT respawn for non-decision issue close", async () => {
  // Create a regular (non-decision) issue
  const createResult = await new Deno.Command("bd", {
    args: ["create", "--title", "Hook Test: Regular task", "--type", "task", "--label", "hook-test"],
    cwd: WORK_DIR,
    stdout: "piped",
    stderr: "piped",
  }).output();

  const createOutput = new TextDecoder().decode(createResult.stdout);
  const match = createOutput.match(/Created issue:\s*(\S+)/);
  if (!match) {
    throw new Error(`Failed to create test issue: ${createOutput}`);
  }
  const issueId = match[1];

  try {
    // Run hook simulating bd close on non-decision issue
    const result = await runHook({
      CLAUDE_TOOL_INPUT: `bd close ${issueId}`,
      CLAUDE_TOOL_OUTPUT: `Closed issue: ${issueId}`,
      STARTUP_BD: "beads-work123",
    });

    assertEquals(result.code, 0, "Hook should exit cleanly");
    assertEquals(
      result.capturedCommands.length,
      0,
      "Should NOT respawn miner for non-decision issue",
    );
  } finally {
    // Cleanup
    await new Deno.Command("bd", {
      args: ["close", issueId, "--reason", "Hook test cleanup"],
      cwd: WORK_DIR,
      stdout: "piped",
      stderr: "piped",
    }).output().catch(() => {});
  }
});

// ============================================================================
// SPAWN Comment Detection Tests (existing functionality)
// ============================================================================

Deno.test("Hook spawns agent from SPAWN: comment", async () => {
  const result = await runHook({
    CLAUDE_TOOL_INPUT: 'bd comments add beads-123 "SPAWN: designer --task Design the auth system"',
    CLAUDE_TOOL_OUTPUT: "Comment added",
    STARTUP_BD: "beads-convoy456",
  });

  assertEquals(result.code, 0);
  assertEquals(result.capturedCommands.length, 1);
  assertStringIncludes(result.capturedCommands[0], "call designer");
  assertStringIncludes(result.capturedCommands[0], "--claim beads-convoy456");
});

// ============================================================================
// Edge Cases
// ============================================================================

Deno.test("Hook handles missing CLAUDE_TOOL_OUTPUT gracefully", async () => {
  const result = await runHook({
    CLAUDE_TOOL_INPUT: 'bd create --label pd:decision --title "X"',
    // No CLAUDE_TOOL_OUTPUT
    STARTUP_BD: "beads-work123",
  });

  assertEquals(result.code, 0, "Hook should exit cleanly");
  // Should not spawn PM because we can't extract the decision ID
  assertEquals(
    result.capturedCommands.length,
    0,
    "Should NOT spawn PM without issue ID",
  );
});

Deno.test("Hook handles empty stdin", async () => {
  const result = await runHook({
    CLAUDE_TOOL_INPUT: 'bd create --label pd:decision --title "X"',
    CLAUDE_TOOL_OUTPUT: "Created issue: beads-dec123",
    STARTUP_BD: "beads-work123",
  }, ""); // Empty stdin

  assertEquals(result.code, 0, "Hook should handle empty stdin");
  assertEquals(result.capturedCommands.length, 1);
});
