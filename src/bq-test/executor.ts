// src/bq-test/executor.ts
// Real agent executor for BQ testing

import { startActiveObservation } from "npm:@langfuse/tracing@^4.5.1";
import type { BehaviorTest } from "./types.ts";
import type { ActualBehavior } from "./runner.ts";

export interface ExecutorConfig {
  /** Path to paydirt binary */
  paydirtBin: string;
  /** Working directory for agent execution */
  workDir: string;
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Whether to print agent output */
  verbose?: boolean;
  /** Langfuse session ID for tracing */
  langfuseSessionId?: string;
  /** Whether to enable Langfuse tracing */
  langfuseEnabled?: boolean;
}

export interface ExecutionResult {
  behavior: ActualBehavior;
  rawOutput: string;
  exitCode: number;
  duration: number;
}

/**
 * Execute a real Claude agent and capture its behavior
 */
export async function executeRealAgent(
  test: BehaviorTest,
  config: ExecutorConfig,
): Promise<ExecutionResult> {
  if (config.langfuseEnabled) {
    return await startActiveObservation(
      `bq-test-${test.scenario.name}`,
      async (span) => {
        span.update({
          input: {
            scenario: test.scenario.name,
            agent: test.scenario.agent,
            prompt: test.scenario.input,
          },
          sessionId: config.langfuseSessionId,
          metadata: {
            testId: test.id,
            agent: test.scenario.agent,
          },
          tags: ["bq-test", test.scenario.agent],
        });

        const result = await executeAgentProcess(test, config);

        span.update({
          output: {
            behavior: result.behavior,
            exitCode: result.exitCode,
          },
          level: result.exitCode === 0 ? "DEFAULT" : "ERROR",
        });

        return result;
      }
    );
  }

  return await executeAgentProcess(test, config);
}

/**
 * Execute the agent process (internal implementation)
 */
async function executeAgentProcess(
  test: BehaviorTest,
  config: ExecutorConfig,
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const timeout = config.timeout ?? 60000;

  // Create a unique test claim ID
  const testClaimId = `bq-test-${Date.now()}`;

  // Build the claude command with the test prompt
  const prompt = buildTestPrompt(test);

  // Build environment variables
  const env: Record<string, string> = {
    ...Deno.env.toObject(),
    PAYDIRT_CLAIM: testClaimId,
    PAYDIRT_BIN: config.paydirtBin,
    PAYDIRT_PROSPECT: test.scenario.agent,
    // Disable hooks during testing to avoid side effects
    PAYDIRT_HOOK_SYNC: "1",
  };

  if (config.langfuseEnabled) {
    env.LANGFUSE_ENABLED = "true";
    env.LANGFUSE_SESSION_ID = config.langfuseSessionId || "";
    env.LANGFUSE_TRACE_NAME = `bq-${test.scenario.name}`;
    env.LANGFUSE_SECRET_KEY = Deno.env.get("LANGFUSE_SECRET_KEY") || "";
    env.LANGFUSE_PUBLIC_KEY = Deno.env.get("LANGFUSE_PUBLIC_KEY") || "";
    env.LANGFUSE_BASE_URL = Deno.env.get("LANGFUSE_BASE_URL") || "";
  }

  // Use claude CLI with --print to capture output
  const cmd = new Deno.Command("claude", {
    args: [
      "--print",
      "--dangerously-skip-permissions",
      "-p", prompt,
    ],
    cwd: config.workDir,
    env,
    stdout: "piped",
    stderr: "piped",
  });

  // Execute with timeout
  const process = cmd.spawn();

  let output = "";
  let stderr = "";
  let exitCode = 0;

  let timeoutId: number | undefined;

  try {
    // Read stdout
    const reader = process.stdout.getReader();
    const decoder = new TextDecoder();

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Agent execution timed out")), timeout);
    });

    const readPromise = (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        output += chunk;
        if (config.verbose) {
          Deno.stdout.writeSync(value);
        }
      }
    })();

    await Promise.race([readPromise, timeoutPromise]);

    // Clear timeout after successful read
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }

    // Read stderr
    const stderrReader = process.stderr.getReader();
    while (true) {
      const { done, value } = await stderrReader.read();
      if (done) break;
      stderr += decoder.decode(value);
    }

    const status = await process.status;
    exitCode = status.code;
  } catch (error) {
    // Clear timeout on error
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    if (error instanceof Error && error.message.includes("timed out")) {
      process.kill("SIGTERM");
      exitCode = 124; // timeout exit code
    }
    throw error;
  }

  const duration = Date.now() - startTime;

  // Parse the output to extract behavior
  const behavior = parseAgentOutput(output, stderr, exitCode);

  return {
    behavior,
    rawOutput: output,
    exitCode,
    duration,
  };
}

/**
 * Build the test prompt for the agent
 */
function buildTestPrompt(test: BehaviorTest): string {
  let prompt = test.scenario.input;

  // Add context if provided
  if (test.scenario.context?.tunnelFile) {
    prompt = `Context from tunnel file:\n${test.scenario.context.tunnelFile}\n\n${prompt}`;
  }

  // Add instructions to exit after completing
  prompt += `\n\nIMPORTANT: After completing this task, exit immediately. This is a BQ test.`;

  return prompt;
}

/**
 * Parse agent output to extract actual behavior
 */
function parseAgentOutput(
  stdout: string,
  stderr: string,
  exitCode: number,
): ActualBehavior {
  const output = stdout + "\n" + stderr;

  // Detect SPAWN: commands
  const spawnMatches = output.match(/SPAWN:\s*(\w+)/g) || [];
  const spawned = spawnMatches.map((m) => m.replace(/SPAWN:\s*/, ""));

  // Detect bd create
  const createdIssue = /bd create/.test(output) || /Created issue:/.test(output);

  // Detect bd close
  const closedIssue = /bd close/.test(output) || /Closed issue:/.test(output);

  // Detect file writes
  const writeMatch = output.match(/Write.*?([^\s]+\.(?:md|ts|js|yaml|json))/);
  const wroteFile = writeMatch ? writeMatch[1] : undefined;

  // Check if exited cleanly
  const exitedCleanly = exitCode === 0 && !stderr.includes("Error:");

  return {
    createdIssue,
    closedIssue,
    exitedCleanly,
    spawned,
    wroteFile,
    output,
  };
}

/**
 * Execute agent using prospect command (for more controlled testing)
 */
export async function executeProspectAgent(
  test: BehaviorTest,
  config: ExecutorConfig,
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const timeout = config.timeout ?? 120000;

  // Create a test issue for the agent to work on
  const testClaimId = await createTestIssue(test, config);

  try {
    // Execute prospect command
    const cmd = new Deno.Command(config.paydirtBin, {
      args: [
        "prospect",
        test.scenario.agent,
        "--claim", testClaimId,
        "--task", test.scenario.input,
      ],
      cwd: config.workDir,
      env: {
        ...Deno.env.toObject(),
        PAYDIRT_HOOK_SYNC: "1",
      },
      stdout: "piped",
      stderr: "piped",
    });

    const process = cmd.spawn();
    let output = "";
    let stderr = "";

    const decoder = new TextDecoder();
    const stdoutReader = process.stdout.getReader();
    const stderrReader = process.stderr.getReader();

    // Read with timeout
    const timeoutId = setTimeout(() => {
      process.kill("SIGTERM");
    }, timeout);

    try {
      // Read stdout
      while (true) {
        const { done, value } = await stdoutReader.read();
        if (done) break;
        output += decoder.decode(value);
        if (config.verbose) {
          Deno.stdout.writeSync(value);
        }
      }

      // Read stderr
      while (true) {
        const { done, value } = await stderrReader.read();
        if (done) break;
        stderr += decoder.decode(value);
      }
    } finally {
      clearTimeout(timeoutId);
    }

    const status = await process.status;
    const duration = Date.now() - startTime;

    // Get comments from the test issue to analyze behavior
    const comments = await getIssueComments(testClaimId, config);
    const fullOutput = output + "\n" + stderr + "\n" + comments;

    const behavior = parseAgentOutput(fullOutput, stderr, status.code);

    return {
      behavior,
      rawOutput: fullOutput,
      exitCode: status.code,
      duration,
    };
  } finally {
    // Cleanup: close the test issue
    await cleanupTestIssue(testClaimId, config);
  }
}

/**
 * Create a test issue for agent execution
 */
async function createTestIssue(
  test: BehaviorTest,
  config: ExecutorConfig,
): Promise<string> {
  const cmd = new Deno.Command("bd", {
    args: [
      "create",
      "--title", `BQ Test: ${test.scenario.name}`,
      "--type", "task",
      "--label", "bq-test",
      "--priority", "4",
    ],
    cwd: config.workDir,
    stdout: "piped",
    stderr: "piped",
  });

  const { stdout } = await cmd.output();
  const output = new TextDecoder().decode(stdout);

  // Extract issue ID from output
  const match = output.match(/Created issue:\s*(\S+)/);
  if (!match) {
    throw new Error(`Failed to create test issue: ${output}`);
  }

  return match[1];
}

/**
 * Get comments from an issue
 */
async function getIssueComments(
  issueId: string,
  config: ExecutorConfig,
): Promise<string> {
  const cmd = new Deno.Command("bd", {
    args: ["comments", issueId],
    cwd: config.workDir,
    stdout: "piped",
    stderr: "piped",
  });

  const { stdout } = await cmd.output();
  return new TextDecoder().decode(stdout);
}

/**
 * Cleanup test issue after execution
 */
async function cleanupTestIssue(
  issueId: string,
  config: ExecutorConfig,
): Promise<void> {
  const cmd = new Deno.Command("bd", {
    args: ["close", issueId, "--reason", "BQ test completed"],
    cwd: config.workDir,
    stdout: "piped",
    stderr: "piped",
  });

  await cmd.output();
}
