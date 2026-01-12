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
