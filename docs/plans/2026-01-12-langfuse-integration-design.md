# Langfuse Integration Design

**Date:** 2026-01-12
**Author:** Claude (Brainstorming Session)
**Status:** Design Approved

## Goal

Enable debugging of test failures by tracing Claude agent executions in Langfuse. When a test fails, developers view the complete agent trace: conversation history, tool calls, and decisions.

## Background

Paydirt tests spawn real Claude agents via CLI. When tests fail, we lack visibility into agent behavior. Langfuse provides observability for LLM applications through OpenTelemetry-based tracing.

## Scope

Instrument all Claude invocations:
- E2E tests (`tests/e2e/*.test.ts`)
- BQ test executor (`src/bq-test/executor.ts`)
- Agent spawning via paydirt CLI (`prospect` commands)
- All Claude Code invocations project-wide

## Architecture

### Integration Pattern: OpenTelemetry + Environment Variables

Paydirt spawns Claude as separate processes. OpenTelemetry context doesn't propagate across process boundaries automatically. Solution:

1. **Parent process**: Initialize Langfuse span processor
2. **Environment variables**: Carry session ID to child processes
3. **Child process**: Langfuse SDK reads env vars and links to parent session
4. **Cleanup**: Force flush before test completion

### Trace Hierarchy

```
Test Session (ID: "test-name-{timestamp}")
├── Test Trace (name: "test-name")
│   ├── Hook Trigger (span)
│   ├── Agent Spawn (span: "prospect-miner")
│   │   └── Claude Execution (span: "claude-miner")
│   │       ├── Tool Calls (nested)
│   │       └── bd commands (nested)
│   └── Verification (span)
```

### Session Grouping

Each test run gets a unique session ID: `{test-name}-{timestamp}`. This groups all traces from a single test execution for easy filtering in Langfuse.

## Implementation

### Dependencies

Add to `deno.json`:

```json
{
  "imports": {
    "@std/dotenv": "jsr:@std/dotenv@^0.225.0",
    "@langfuse/tracing": "npm:@langfuse/tracing@^4.5.1",
    "@langfuse/otel": "npm:@langfuse/otel@^4.5.1",
    "@opentelemetry/sdk-node": "npm:@opentelemetry/sdk-node@^0.209.0"
  }
}
```

### Environment Configuration

Create layered `.env` files:

```
.env.example      # Template (commit to git)
.env              # Local development (gitignore)
.env.test         # Test-specific config (gitignore)
```

**`.env.example`**:
```bash
# Langfuse Configuration
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com

# Tracing Control
LANGFUSE_ENABLED=false
LANGFUSE_DEBUG=false
```

**`.env.test`**:
```bash
LANGFUSE_ENABLED=true
LANGFUSE_DEBUG=true
LANGFUSE_SESSION_PREFIX=test-
```

### Core Components

#### 1. Test Utility (`tests/utils/langfuse.ts`)

```typescript
import { load } from "jsr:@std/dotenv";
import { NodeSDK } from "npm:@opentelemetry/sdk-node@^0.209.0";
import { LangfuseSpanProcessor } from "npm:@langfuse/otel@^4.5.1";

let sdk: NodeSDK | null = null;
let spanProcessor: LangfuseSpanProcessor | null = null;

export interface LangfuseTestContext {
  sessionId: string;
  traceName: string;
  enabled: boolean;
  cleanup: () => Promise<void>;
}

export async function initLangfuseForTest(
  testName: string
): Promise<LangfuseTestContext> {
  await load({ export: true });

  const enabled = Deno.env.get("LANGFUSE_ENABLED") === "true";

  if (!enabled) {
    return {
      sessionId: "",
      traceName: testName,
      enabled: false,
      cleanup: async () => {},
    };
  }

  const sessionId = `${testName}-${Date.now()}`;

  spanProcessor = new LangfuseSpanProcessor();
  sdk = new NodeSDK({ spanProcessors: [spanProcessor] });
  sdk.start();

  return {
    sessionId,
    traceName: testName,
    enabled: true,
    cleanup: async () => {
      if (spanProcessor) await spanProcessor.forceFlush();
      if (sdk) await sdk.shutdown();
    },
  };
}

export function getLangfuseEnv(context: LangfuseTestContext): Record<string, string> {
  if (!context.enabled) return {};

  return {
    LANGFUSE_ENABLED: "true",
    LANGFUSE_SESSION_ID: context.sessionId,
    LANGFUSE_TRACE_NAME: context.traceName,
    LANGFUSE_SECRET_KEY: Deno.env.get("LANGFUSE_SECRET_KEY") || "",
    LANGFUSE_PUBLIC_KEY: Deno.env.get("LANGFUSE_PUBLIC_KEY") || "",
    LANGFUSE_BASE_URL: Deno.env.get("LANGFUSE_BASE_URL") || "",
  };
}
```

#### 2. E2E Test Integration

Update test files to initialize tracing:

```typescript
import { initLangfuseForTest, getLangfuseEnv } from "../utils/langfuse.ts";

Deno.test({
  name: "E2E Stage 1: Miner creates text file",
  async fn() {
    const langfuse = await initLangfuseForTest("E2E Stage 1: Miner creates text file");
    const ctx = await setupStage1Test();

    try {
      // Pass Langfuse env to spawned processes
      const hookResult = await triggerHookForDecisionClose(
        ctx.decisionIssueId,
        langfuse
      );

      // ... test logic ...

    } finally {
      await cleanupStage1Test(ctx);
      await langfuse.cleanup();
    }
  },
});
```

Update spawn functions to include Langfuse env vars:

```typescript
async function triggerHookForDecisionClose(
  decisionId: string,
  langfuse?: LangfuseTestContext,
) {
  const cmd = new Deno.Command("bash", {
    args: [HOOK_SCRIPT],
    env: {
      ...Deno.env.toObject(),
      ...getLangfuseEnv(langfuse),  // Add Langfuse vars
      CLAUDE_TOOL_INPUT: `bd close ${decisionId}`,
      // ... other env vars ...
    },
  });

  return await cmd.output();
}
```

#### 3. BQ Executor Integration (`src/bq-test/executor.ts`)

Add Langfuse configuration to executor:

```typescript
import { startActiveObservation } from "npm:@langfuse/tracing@^4.5.1";

export interface ExecutorConfig {
  paydirtBin: string;
  workDir: string;
  timeout?: number;
  verbose?: boolean;
  langfuseSessionId?: string;
  langfuseEnabled?: boolean;
}

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
```

Pass Langfuse env vars to spawned Claude:

```typescript
async function executeAgentProcess(test, config) {
  const env: Record<string, string> = {
    ...Deno.env.toObject(),
    PAYDIRT_CLAIM: testClaimId,
    PAYDIRT_BIN: config.paydirtBin,
  };

  if (config.langfuseEnabled) {
    env.LANGFUSE_ENABLED = "true";
    env.LANGFUSE_SESSION_ID = config.langfuseSessionId || "";
    env.LANGFUSE_TRACE_NAME = `bq-${test.scenario.name}`;
    env.LANGFUSE_SECRET_KEY = Deno.env.get("LANGFUSE_SECRET_KEY") || "";
    env.LANGFUSE_PUBLIC_KEY = Deno.env.get("LANGFUSE_PUBLIC_KEY") || "";
    env.LANGFUSE_BASE_URL = Deno.env.get("LANGFUSE_BASE_URL") || "";
  }

  const cmd = new Deno.Command("claude", {
    args: ["--print", "--dangerously-skip-permissions", "-p", prompt],
    cwd: config.workDir,
    env,
  });

  return await cmd.spawn();
}
```

#### 4. Paydirt CLI Integration (`src/main.ts`)

Initialize Langfuse at startup:

```typescript
import { load } from "jsr:@std/dotenv";
import { NodeSDK } from "npm:@opentelemetry/sdk-node@^0.209.0";
import { LangfuseSpanProcessor } from "npm:@langfuse/otel@^4.5.1";

let sdk: NodeSDK | null = null;

async function initLangfuse() {
  await load({ export: true });

  if (Deno.env.get("LANGFUSE_ENABLED") !== "true") return;

  const spanProcessor = new LangfuseSpanProcessor();
  sdk = new NodeSDK({ spanProcessors: [spanProcessor] });
  sdk.start();

  const cleanup = async () => {
    if (sdk) {
      await spanProcessor.forceFlush();
      await sdk.shutdown();
    }
  };

  Deno.addSignalListener("SIGINT", cleanup);
  Deno.addSignalListener("SIGTERM", cleanup);
  globalThis.addEventListener("unload", cleanup);
}

await initLangfuse();
```

Wrap prospect command:

```typescript
import { startActiveObservation } from "npm:@langfuse/tracing@^4.5.1";

export async function prospectCommand(args: ProspectArgs) {
  if (Deno.env.get("LANGFUSE_ENABLED") !== "true") {
    return await executeProspect(args);
  }

  return await startActiveObservation(
    `prospect-${args.role}`,
    async (span) => {
      span.update({
        input: { role: args.role, claim: args.claim, task: args.task },
        sessionId: Deno.env.get("LANGFUSE_SESSION_ID"),
        metadata: { claimId: args.claim },
        tags: ["prospect", args.role],
      });

      const result = await executeProspect(args);

      span.update({
        output: { exitCode: result.exitCode },
        level: result.exitCode === 0 ? "DEFAULT" : "ERROR",
      });

      return result;
    }
  );
}
```

#### 5. Claude Launcher (`src/claude/launcher.ts`)

Pass Langfuse vars to spawned Claude processes:

```typescript
export async function launchClaude(config: ClaudeConfig) {
  const env: Record<string, string> = {
    ...Deno.env.toObject(),
    ...config.env,
  };

  if (Deno.env.get("LANGFUSE_ENABLED") === "true") {
    env.LANGFUSE_ENABLED = "true";
    env.LANGFUSE_SESSION_ID = Deno.env.get("LANGFUSE_SESSION_ID") || "";
    env.LANGFUSE_SECRET_KEY = Deno.env.get("LANGFUSE_SECRET_KEY") || "";
    env.LANGFUSE_PUBLIC_KEY = Deno.env.get("LANGFUSE_PUBLIC_KEY") || "";
    env.LANGFUSE_BASE_URL = Deno.env.get("LANGFUSE_BASE_URL") || "";
  }

  const cmd = new Deno.Command("claude", {
    args: buildClaudeArgs(config),
    cwd: config.workDir,
    env,
  });

  return cmd.spawn();
}
```

## Verification

### 1. Basic Integration Test

Create `tests/integration/langfuse-integration.test.ts`:

```typescript
import { assertEquals } from "@std/assert";
import { initLangfuseForTest, getLangfuseEnv } from "../utils/langfuse.ts";

Deno.test("Langfuse initializes correctly", async () => {
  const ctx = await initLangfuseForTest("test-init");

  assertEquals(ctx.enabled, true);
  assertEquals(ctx.sessionId.startsWith("test-init-"), true);

  await ctx.cleanup();
});

Deno.test("Langfuse env vars pass correctly", async () => {
  const ctx = await initLangfuseForTest("test-env");
  const env = getLangfuseEnv(ctx);

  assertEquals(env.LANGFUSE_ENABLED, "true");
  assertEquals(env.LANGFUSE_SESSION_ID, ctx.sessionId);

  await ctx.cleanup();
});
```

### 2. E2E Verification

```bash
# Setup environment
export LANGFUSE_ENABLED=true
export LANGFUSE_SECRET_KEY=sk-lf-...
export LANGFUSE_PUBLIC_KEY=pk-lf-...
export LANGFUSE_BASE_URL=https://cloud.langfuse.com

# Run E2E test
RUN_E2E_TESTS=1 deno test tests/e2e/real-implementation.test.ts --allow-all

# Check Langfuse UI for traces with:
# - Session ID: "E2E Stage 1: Miner creates text file-{timestamp}"
# - Tags: ["e2e", "miner"]
```

### 3. BQ Test Verification

```bash
# Run BQ tests
deno run --allow-all src/bq-test/runner.ts

# Verify in Langfuse:
# - Session: "BQ: {scenario-name}-{timestamp}"
# - Trace: "bq-test-{scenario-name}"
# - Tags: ["bq-test", "{agent-role}"]
```

## Implementation Plan

### Phase 1: Foundation (Day 1)
1. Add dependencies to `deno.json`
2. Create `.env.example` and `.env.test`
3. Implement `tests/utils/langfuse.ts`
4. Write integration tests

### Phase 2: Test Integration (Day 2)
5. Update E2E tests to use Langfuse
6. Verify traces appear in Langfuse UI
7. Update BQ executor with Langfuse support

### Phase 3: Production Integration (Day 3)
8. Add Langfuse init to `src/main.ts`
9. Wrap prospect command with tracing
10. Update Claude launcher to pass env vars

### Phase 4: Verification (Day 4)
11. Run full test suite with tracing enabled
12. Verify trace hierarchy in Langfuse
13. Document usage in README

## Rollout

### Development
- Developers set `LANGFUSE_ENABLED=true` in `.env` when debugging
- Traces appear in shared Langfuse project

### CI/CD
- Set `LANGFUSE_ENABLED=true` in CI environment
- Use separate Langfuse project for CI traces
- Traces link to test run IDs

### Production
- Optional: Enable for production agents
- Use environment-specific session prefixes
- Monitor costs (Langfuse Cloud pricing)

## Benefits

1. **Debug test failures**: View full agent conversation when tests fail
2. **Understand agent behavior**: See tool calls, decisions, and context
3. **Cost tracking**: Monitor API usage per test
4. **Performance analysis**: Identify slow tests
5. **Dataset creation**: Build corpus of agent executions

## Trade-offs

### Pros
- Zero changes to Claude Code itself
- Environment-based control (easy to disable)
- Works with compiled Deno binaries
- Same mechanism for tests and production

### Cons
- Adds ~500ms overhead per test (span processor initialization)
- Requires internet connection (Langfuse Cloud)
- Environment variables needed for every spawn
- Additional cost (Langfuse Cloud pricing)

## Open Questions

None. Design approved and ready for implementation.

## References

- [Langfuse TypeScript SDK](https://langfuse.com/docs/sdk/typescript/guide)
- [Langfuse OpenTelemetry Integration](https://langfuse.com/docs/integrations/opentelemetry)
- [Deno Standard Library - dotenv](https://jsr.io/@std/dotenv)
