// tests/integration/agent-behavior.test.ts
import { assertEquals, assertGreater } from "@std/assert";
import { runTestSuite, runBehaviorTest } from "../../src/bq-test/runner.ts";
import type { BehaviorTest } from "../../src/bq-test/types.ts";

// Define test cases directly (in real impl, load from YAML)
const campBossTest: BehaviorTest = {
  scenario: {
    name: "camp-boss-spawns-surveyor",
    description: "Camp Boss receives implementation request and spawns Surveyor",
    agent: "camp-boss",
    input: "User: I need to add user authentication to the application.",
  },
  expectations: {
    assertions: {
      spawned: ["surveyor"],
      createdIssue: false,
      exitedCleanly: true,
    },
    labels: {
      required: ["SPAWN:"],
      forbidden: ["ERROR:"],
    },
    judge: {
      criteria: "Camp Boss should delegate to Surveyor, not implement directly",
      minScore: 7,
    },
  },
};

const pmAgentTest: BehaviorTest = {
  scenario: {
    name: "pm-answers-decision-issue",
    description: "PM Agent answers decision issue and exits",
    agent: "pm",
    input: "Decision: Which auth provider?",
    context: {
      tunnelFile: "Q: Which auth? A: Use Supabase Auth",
    },
  },
  expectations: {
    assertions: {
      closedIssue: true,
      exitedCleanly: true,
    },
    labels: {
      required: ["DECISION:"],
      forbidden: ["ERROR:", "SPAWN:"],
    },
    judge: {
      criteria: "PM should answer with confidence and close issue",
      minScore: 7,
    },
  },
};

Deno.test("BQ Test Suite: Camp Boss and PM Agent", async () => {
  const result = await runTestSuite(
    [campBossTest, pmAgentTest],
    "Core Agent Behaviors",
    true // mock mode
  );

  console.log(`\nBQ Test Results: ${result.suiteName}`);
  console.log(`Pass Rate: ${result.passRate.toFixed(1)}%`);
  console.log(`Passed: ${result.passed}/${result.totalTests}`);

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
});

Deno.test("Individual: Camp Boss spawns Surveyor", async () => {
  const result = await runBehaviorTest(campBossTest, true);
  assertEquals(result.passed, true, "Camp Boss test should pass");
});

Deno.test("Individual: PM Agent answers decision", async () => {
  const result = await runBehaviorTest(pmAgentTest, true);
  assertEquals(result.passed, true, "PM Agent test should pass");
});
