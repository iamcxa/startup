// src/bq-test/types.ts

/**
 * Agent Behavior Quality (BQ) Test Framework Types
 *
 * These types define the structure for testing agent behavior patterns.
 * BQ tests verify that agents respond correctly to scenarios by checking:
 * 1. Assertions - concrete actions taken (spawns, file writes, etc.)
 * 2. Labels - keywords that must/must not appear in output
 * 3. Judge criteria - LLM-as-judge evaluation for nuanced behavior
 */

export interface BehaviorScenario {
  name: string;
  description: string;
  agent: string;
  input: string;
  context?: {
    tunnelFile?: string;
    existingComments?: string[];
    environment?: Record<string, string>;
  };
}

export interface BehaviorExpectation {
  // 1. Assertion-based checks
  assertions: {
    spawned?: string[]; // Expected agent spawns
    createdIssue?: boolean; // Should create bd issue
    closedIssue?: boolean; // Should close bd issue
    exitedCleanly?: boolean; // Should exit without error
    wroteFile?: string; // Should write specific file
  };

  // 2. Label detection
  labels: {
    required: string[]; // Must appear in output
    forbidden: string[]; // Must NOT appear in output
  };

  // 3. LLM-as-Judge criteria
  judge?: {
    criteria: string; // What to evaluate
    minScore: number; // Minimum score (0-10)
  };
}

export interface BehaviorTest {
  scenario: BehaviorScenario;
  expectations: BehaviorExpectation;
}

export interface TestResult {
  testName: string;
  passed: boolean;
  details: {
    assertionsPassed: boolean;
    assertionFailures: string[];
    labelsPassed: boolean;
    labelFailures: string[];
    judgeScore?: number;
    judgePassed?: boolean;
  };
  duration: number;
}

export interface TestSuite {
  name: string;
  tests: BehaviorTest[];
}

export interface SuiteResult {
  suiteName: string;
  totalTests: number;
  passed: number;
  failed: number;
  passRate: number;
  results: TestResult[];
}
