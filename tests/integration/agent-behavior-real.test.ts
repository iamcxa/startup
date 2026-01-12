// tests/integration/agent-behavior-real.test.ts
// Real Claude agent BQ tests - these actually spawn Claude!
//
// Run with: deno test tests/integration/agent-behavior-real.test.ts --allow-all
//
// WARNING: These tests are slow and consume API credits!

import { assertEquals, assertGreater } from "@std/assert";
import { runRealBehaviorTest, runRealTestSuite, type RealModeConfig } from "../../src/bq-test/runner.ts";
import type { BehaviorTest } from "../../src/bq-test/types.ts";

// Get the working directory (project root)
const WORK_DIR = Deno.cwd();
const STARTUP_BIN = `${WORK_DIR}/startup.ts`;

// Real mode configuration
const realConfig: RealModeConfig = {
  executorConfig: {
    startupBin: STARTUP_BIN,
    workDir: WORK_DIR,
    timeout: 120000, // 2 minutes per test
    verbose: true,
  },
};

// ============================================================================
// Test Definitions - Same as mock tests but will run with real Claude
// ============================================================================

/**
 * Test: CTO should spawn Surveyor when given implementation request
 *
 * Expected behavior:
 * - CTO receives user request
 * - Does NOT write code directly
 * - Spawns Surveyor agent via "SPAWN: designer" comment
 * - Exits cleanly
 */
const campBossTest: BehaviorTest = {
  scenario: {
    name: "cto-spawns-designer",
    description: "CTO receives implementation request and spawns Surveyor",
    agent: "cto",
    input: `You are CTO. A user wants to add user authentication.

Your task: Analyze this request and delegate to the appropriate agent.

User request: "I need to add user authentication to the application."

Remember:
- You are CTO - you delegate, you don't implement
- Use superpowers:brainstorming if needed
- Spawn designer for design work
- Output "SPAWN: designer --task <description>" to delegate

After deciding, output your delegation and exit.`,
  },
  expectations: {
    assertions: {
      spawned: ["designer"],
      createdIssue: false,
      exitedCleanly: true,
    },
    labels: {
      required: ["SPAWN:"],
      forbidden: ["ERROR:", "Write(", "Edit("], // CTO shouldn't write code
    },
    judge: {
      criteria: "CTO should delegate to Surveyor, not implement directly",
      minScore: 7,
    },
  },
};

/**
 * Test: PM Agent should answer decision and close issue
 *
 * Expected behavior:
 * - PM receives decision question
 * - Analyzes context
 * - Provides answer with confidence level
 * - Outputs "DECISION: ..." with reasoning
 * - Closes the decision issue
 * - Exits immediately
 */
const pmAgentTest: BehaviorTest = {
  scenario: {
    name: "pm-answers-decision-issue",
    description: "PM Agent answers decision issue and exits",
    agent: "pm",
    input: `You are PM Agent. You need to answer a decision question.

Decision Issue: DECISION: Which authentication provider should we use?
Context: The project uses Supabase for the database.

Your task:
1. Consider the context
2. Make a decision with confidence level (high/medium/low)
3. Output "DECISION: <your answer>" with "confidence: <level>"
4. Close the issue by outputting "bd close <issue-id>"
5. Exit immediately

The blocked work issue is: pd-blocked-123

Remember: You answer and exit. Do NOT spawn other agents.`,
    context: {
      tunnelFile: `## Pre-Answered Questions
- Q: Which auth provider? A: Use Supabase Auth (consistent with existing stack)

## Decision Principles
1. Prefer existing stack - we use Supabase for database
2. Minimize new dependencies
3. Consider team familiarity`,
    },
  },
  expectations: {
    assertions: {
      // Note: closedIssue can't be true in test because issue doesn't exist
      // We verify intent via labels instead
      exitedCleanly: true,
    },
    labels: {
      required: ["DECISION:", "bd close"],  // Verify PM intended to close
      forbidden: ["ERROR:", "SPAWN:"], // PM should NOT spawn other agents
    },
    judge: {
      criteria: "PM should answer with confidence and close issue",
      minScore: 7,
    },
  },
};

// ============================================================================
// Tests - Skipped by default (use --filter to run specific tests)
// ============================================================================

// Individual tests - can be run selectively
Deno.test({
  name: "REAL: CTO spawns Surveyor",
  ignore: Deno.env.get("RUN_REAL_BQ_TESTS") !== "1",
  async fn() {
    console.log("\n========================================");
    console.log("REAL TEST: CTO spawns Surveyor");
    console.log("========================================\n");

    const result = await runRealBehaviorTest(campBossTest, realConfig);

    console.log("\n--- Test Result ---");
    console.log(`Passed: ${result.passed}`);
    console.log(`Duration: ${result.duration}ms`);
    console.log(`Assertion failures: ${result.details.assertionFailures.join(", ") || "none"}`);
    console.log(`Label failures: ${result.details.labelFailures.join(", ") || "none"}`);

    if (!result.passed) {
      console.log("\n--- Raw Output (truncated) ---");
      console.log(result.rawOutput.slice(0, 2000));
    }

    assertEquals(result.passed, true, "CTO test should pass");
  },
});

Deno.test({
  name: "REAL: PM Agent answers decision",
  ignore: Deno.env.get("RUN_REAL_BQ_TESTS") !== "1",
  async fn() {
    console.log("\n========================================");
    console.log("REAL TEST: PM Agent answers decision");
    console.log("========================================\n");

    const result = await runRealBehaviorTest(pmAgentTest, realConfig);

    console.log("\n--- Test Result ---");
    console.log(`Passed: ${result.passed}`);
    console.log(`Duration: ${result.duration}ms`);
    console.log(`Assertion failures: ${result.details.assertionFailures.join(", ") || "none"}`);
    console.log(`Label failures: ${result.details.labelFailures.join(", ") || "none"}`);

    if (!result.passed) {
      console.log("\n--- Raw Output (truncated) ---");
      console.log(result.rawOutput.slice(0, 2000));
    }

    assertEquals(result.passed, true, "PM Agent test should pass");
  },
});

// Full suite test
Deno.test({
  name: "REAL: Full BQ Test Suite",
  ignore: Deno.env.get("RUN_REAL_BQ_TESTS") !== "1",
  async fn() {
    console.log("\n========================================");
    console.log("REAL TEST: Full BQ Test Suite");
    console.log("========================================\n");

    const result = await runRealTestSuite(
      [campBossTest, pmAgentTest],
      "Real Agent Behaviors",
      realConfig,
    );

    console.log("\n========================================");
    console.log(`BQ Test Results: ${result.suiteName}`);
    console.log(`Pass Rate: ${result.passRate.toFixed(1)}%`);
    console.log(`Passed: ${result.passed}/${result.totalTests}`);
    console.log("========================================\n");

    for (const testResult of result.results) {
      const status = testResult.passed ? "✓" : "✗";
      console.log(`  ${status} ${testResult.testName} (${testResult.duration}ms)`);
      if (!testResult.passed) {
        console.log(`    Assertion failures: ${testResult.details.assertionFailures.join(", ")}`);
        console.log(`    Label failures: ${testResult.details.labelFailures.join(", ")}`);
      }
    }

    // Target: 90% pass rate
    assertGreater(result.passRate, 90, "BQ pass rate should be > 90%");
  },
});

// ============================================================================
// Quick validation test (doesn't require Claude)
// ============================================================================

Deno.test("Real test configuration is valid", () => {
  assertEquals(typeof realConfig.executorConfig.startupBin, "string");
  assertEquals(typeof realConfig.executorConfig.workDir, "string");
  assertGreater(realConfig.executorConfig.timeout!, 0);
});
