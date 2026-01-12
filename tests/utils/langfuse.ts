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
      // Set span attributes
      span.setAttributes({
        "langfuse.session_id": context.sessionId,
        "langfuse.trace_name": context.traceName,
        ...attributes,
      });

      debugLog(`Span started: ${spanName}`, attributes);

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
    "langfuse.session_id": context.sessionId,
    "langfuse.trace_name": context.traceName,
    "event.type": "milestone",
    ...attributes,
  });

  debugLog(`Event traced: ${eventName}`, attributes);
  span.end();
}
