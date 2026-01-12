import { load } from "jsr:@std/dotenv";
import { NodeSDK } from "npm:@opentelemetry/sdk-node@^0.209.0";
import { LangfuseSpanProcessor } from "npm:@langfuse/otel@^4.5.1";
import { trace, SpanStatusCode } from "npm:@opentelemetry/api@^1.9.0";

let sdk: NodeSDK | null = null;
let spanProcessor: LangfuseSpanProcessor | null = null;

const DEBUG = Deno.env.get("LANGFUSE_DEBUG") === "true";

function debugLog(message: string, data?: Record<string, unknown>) {
  if (DEBUG || Deno.env.get("LANGFUSE_DEBUG") === "true") {
    console.log(`[Langfuse] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
}

export interface LangfuseTestContext {
  sessionId: string;
  traceName: string;
  enabled: boolean;
  cleanup: () => Promise<void>;
}

export async function initLangfuseForTest(
  testName: string
): Promise<LangfuseTestContext> {
  // Try to load .env.test first, then .env
  try {
    await load({ export: true, envPath: ".env.test" });
    debugLog("Loaded .env.test");
  } catch {
    try {
      await load({ export: true });
      debugLog("Loaded .env (fallback)");
    } catch {
      debugLog("No .env file found, using existing environment");
    }
  }

  const enabled = Deno.env.get("LANGFUSE_ENABLED") === "true";
  const secretKey = Deno.env.get("LANGFUSE_SECRET_KEY") || "";
  const publicKey = Deno.env.get("LANGFUSE_PUBLIC_KEY") || "";
  const baseUrl = Deno.env.get("LANGFUSE_BASE_URL") || "";

  debugLog("Environment check", {
    LANGFUSE_ENABLED: enabled,
    LANGFUSE_SECRET_KEY: secretKey ? `${secretKey.substring(0, 10)}...` : "(empty)",
    LANGFUSE_PUBLIC_KEY: publicKey ? `${publicKey.substring(0, 10)}...` : "(empty)",
    LANGFUSE_BASE_URL: baseUrl,
  });

  if (!enabled) {
    debugLog("Langfuse DISABLED - returning disabled context");
    return {
      sessionId: "",
      traceName: testName,
      enabled: false,
      cleanup: async () => {},
    };
  }

  if (!secretKey || !publicKey) {
    console.warn("[Langfuse] WARNING: LANGFUSE_ENABLED=true but missing credentials!");
    debugLog("Missing credentials", { secretKey: !!secretKey, publicKey: !!publicKey });
  }

  const sessionId = `${testName}-${Date.now()}`;
  debugLog(`Initializing Langfuse SDK`, { sessionId, testName });

  spanProcessor = new LangfuseSpanProcessor();
  sdk = new NodeSDK({ spanProcessors: [spanProcessor] });
  sdk.start();

  debugLog("Langfuse SDK started successfully");

  return {
    sessionId,
    traceName: testName,
    enabled: true,
    cleanup: async () => {
      debugLog("Cleanup: flushing spans...");
      if (spanProcessor) {
        await spanProcessor.forceFlush();
        debugLog("Cleanup: spans flushed");
      }
      if (sdk) {
        await sdk.shutdown();
        debugLog("Cleanup: SDK shutdown complete");
      }
    },
  };
}

export function getLangfuseEnv(context?: LangfuseTestContext): Record<string, string> {
  if (!context || !context.enabled) return {};

  return {
    LANGFUSE_ENABLED: "true",
    LANGFUSE_SESSION_ID: context.sessionId,
    LANGFUSE_TRACE_NAME: context.traceName,
    LANGFUSE_SECRET_KEY: Deno.env.get("LANGFUSE_SECRET_KEY") || "",
    LANGFUSE_PUBLIC_KEY: Deno.env.get("LANGFUSE_PUBLIC_KEY") || "",
    LANGFUSE_BASE_URL: Deno.env.get("LANGFUSE_BASE_URL") || "",
  };
}

/**
 * Create a traced span for a test operation.
 * This is required to actually send traces to Langfuse.
 *
 * Uses Langfuse-specific attributes:
 * - langfuse.session.id: Groups all spans into a Langfuse Session
 * - langfuse.trace.name: Sets the trace name in Langfuse UI
 * - langfuse.tags: Tags for filtering in Langfuse UI
 *
 * See: https://langfuse.com/integrations/native/opentelemetry
 */
export async function withTestSpan<T>(
  context: LangfuseTestContext,
  spanName: string,
  attributes: Record<string, string | number | boolean>,
  fn: () => Promise<T>,
): Promise<T> {
  if (!context.enabled) {
    return await fn();
  }

  const tracer = trace.getTracer("paydirt-e2e-test");

  return await tracer.startActiveSpan(spanName, async (span) => {
    try {
      // Set Langfuse-specific attributes for session grouping
      span.setAttributes({
        // Langfuse session - groups all spans in this test run
        "langfuse.session.id": context.sessionId,
        // Langfuse trace name
        "langfuse.trace.name": context.traceName,
        // Tags for filtering
        "langfuse.tags": JSON.stringify(["e2e-test", "paydirt"]),
        // Custom attributes
        ...attributes,
      });

      debugLog(`Span started: ${spanName}`, { session: context.sessionId, ...attributes });

      const result = await fn();

      span.setStatus({ code: SpanStatusCode.OK });
      debugLog(`Span completed: ${spanName}`);

      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error)
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      debugLog(`Span error: ${spanName}`, { error: String(error) });
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Create a traced span for an agent/LLM operation with gen_ai semantic conventions.
 * This captures input/output for Langfuse visualization.
 *
 * Uses gen_ai semantic conventions:
 * - gen_ai.system: The AI system (e.g., "claude")
 * - gen_ai.request.model: The model used
 * - gen_ai.prompt.0.role: Input role (usually "user")
 * - gen_ai.prompt.0.content: The input/prompt sent to the agent
 * - gen_ai.completion.0.role: Output role (usually "assistant")
 * - gen_ai.completion.0.content: The agent's response/output
 *
 * See: https://langfuse.com/docs/integrations/opentelemetry
 */
export async function withAgentSpan<T>(
  context: LangfuseTestContext,
  spanName: string,
  input: {
    model?: string;
    prompt: string;
    role?: string;
    task?: string;
  },
  fn: () => Promise<{ result: T; output?: string }>,
): Promise<T> {
  if (!context.enabled) {
    const { result } = await fn();
    return result;
  }

  const tracer = trace.getTracer("paydirt-e2e-test");

  return await tracer.startActiveSpan(spanName, async (span) => {
    try {
      // Set Langfuse-specific attributes
      span.setAttributes({
        "langfuse.session.id": context.sessionId,
        "langfuse.trace.name": context.traceName,
        "langfuse.tags": JSON.stringify(["e2e-test", "agent", "paydirt"]),
      });

      // Set gen_ai semantic convention attributes for input
      span.setAttributes({
        "gen_ai.system": "claude",
        "gen_ai.request.model": input.model || "sonnet",
        "gen_ai.prompt.0.role": input.role || "user",
        "gen_ai.prompt.0.content": input.prompt,
      });

      // Add custom attributes
      if (input.task) {
        span.setAttribute("agent.task", input.task);
      }

      debugLog(`Agent span started: ${spanName}`, {
        session: context.sessionId,
        model: input.model,
        promptLength: input.prompt.length,
      });

      const { result, output } = await fn();

      // Set gen_ai completion attributes if output is provided
      if (output) {
        span.setAttributes({
          "gen_ai.completion.0.role": "assistant",
          "gen_ai.completion.0.content": output.length > 10000
            ? output.substring(0, 10000) + "...[truncated]"
            : output,
        });
      }

      span.setStatus({ code: SpanStatusCode.OK });
      debugLog(`Agent span completed: ${spanName}`, { outputLength: output?.length });

      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      debugLog(`Agent span error: ${spanName}`, { error: String(error) });
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Create a simple trace event (for logging key milestones).
 */
export function traceEvent(
  context: LangfuseTestContext,
  eventName: string,
  attributes?: Record<string, string | number | boolean>,
): void {
  if (!context.enabled) return;

  const tracer = trace.getTracer("paydirt-e2e-test");
  const span = tracer.startSpan(eventName);

  span.setAttributes({
    // Langfuse session - groups all spans in this test run
    "langfuse.session.id": context.sessionId,
    // Langfuse trace name
    "langfuse.trace.name": context.traceName,
    // Tags
    "langfuse.tags": JSON.stringify(["e2e-test", "event"]),
    // Event type
    "event.type": "milestone",
    ...attributes,
  });

  debugLog(`Event traced: ${eventName}`, attributes);
  span.end();
}
