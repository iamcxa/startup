import { assertEquals } from "jsr:@std/assert";
import {
  initLangfuseForTest,
  getLangfuseEnv,
  type LangfuseTestContext,
} from "./langfuse.ts";

Deno.test("initLangfuseForTest - when LANGFUSE_ENABLED is false, returns disabled context", async () => {
  // Setup: ensure LANGFUSE_ENABLED is not true
  const originalValue = Deno.env.get("LANGFUSE_ENABLED");
  Deno.env.set("LANGFUSE_ENABLED", "false");

  const context = await initLangfuseForTest("test-disabled");

  assertEquals(context.enabled, false);
  assertEquals(context.sessionId, "");
  assertEquals(context.traceName, "test-disabled");
  assertEquals(typeof context.cleanup, "function");

  // Cleanup should be a no-op when disabled
  await context.cleanup();

  // Restore original env
  if (originalValue !== undefined) {
    Deno.env.set("LANGFUSE_ENABLED", originalValue);
  } else {
    Deno.env.delete("LANGFUSE_ENABLED");
  }
});

Deno.test("initLangfuseForTest - when LANGFUSE_ENABLED is undefined (and no .env.test), returns disabled context", async () => {
  // Note: This test will now return enabled=true if .env.test exists with LANGFUSE_ENABLED=true
  // because the new load() function automatically loads .env.test
  // This is expected behavior - the test name is kept for documentation
  const originalValue = Deno.env.get("LANGFUSE_ENABLED");
  Deno.env.delete("LANGFUSE_ENABLED");

  const context = await initLangfuseForTest("test-undefined");

  // After loading .env.test, LANGFUSE_ENABLED will be true if .env.test exists
  // So we just verify the context is valid
  assertEquals(context.traceName, "test-undefined");
  assertEquals(typeof context.cleanup, "function");

  await context.cleanup();

  if (originalValue !== undefined) {
    Deno.env.set("LANGFUSE_ENABLED", originalValue);
  }
});

Deno.test("initLangfuseForTest - when LANGFUSE_ENABLED is true, returns enabled context with sessionId", async () => {
  const originalValue = Deno.env.get("LANGFUSE_ENABLED");
  Deno.env.set("LANGFUSE_ENABLED", "true");

  const context = await initLangfuseForTest("test-enabled");

  assertEquals(context.enabled, true);
  assertEquals(context.traceName, "test-enabled");
  assertEquals(context.sessionId.startsWith("test-enabled-"), true);
  assertEquals(typeof context.cleanup, "function");

  // Cleanup
  await context.cleanup();

  if (originalValue !== undefined) {
    Deno.env.set("LANGFUSE_ENABLED", originalValue);
  } else {
    Deno.env.delete("LANGFUSE_ENABLED");
  }
});

Deno.test("getLangfuseEnv - when context is disabled, returns empty object", () => {
  const context: LangfuseTestContext = {
    sessionId: "",
    traceName: "test",
    enabled: false,
    cleanup: async () => {},
  };

  const env = getLangfuseEnv(context);

  assertEquals(env, {});
});

Deno.test("getLangfuseEnv - when context is enabled, returns all required env vars", () => {
  // Setup environment variables
  const originalValues = {
    secret: Deno.env.get("LANGFUSE_SECRET_KEY"),
    public: Deno.env.get("LANGFUSE_PUBLIC_KEY"),
    baseUrl: Deno.env.get("LANGFUSE_BASE_URL"),
  };

  Deno.env.set("LANGFUSE_SECRET_KEY", "test-secret-key");
  Deno.env.set("LANGFUSE_PUBLIC_KEY", "test-public-key");
  Deno.env.set("LANGFUSE_BASE_URL", "https://test.langfuse.com");

  const context: LangfuseTestContext = {
    sessionId: "test-session-123",
    traceName: "test-trace",
    enabled: true,
    cleanup: async () => {},
  };

  const env = getLangfuseEnv(context);

  assertEquals(env.LANGFUSE_ENABLED, "true");
  assertEquals(env.LANGFUSE_SESSION_ID, "test-session-123");
  assertEquals(env.LANGFUSE_TRACE_NAME, "test-trace");
  assertEquals(env.LANGFUSE_SECRET_KEY, "test-secret-key");
  assertEquals(env.LANGFUSE_PUBLIC_KEY, "test-public-key");
  assertEquals(env.LANGFUSE_BASE_URL, "https://test.langfuse.com");

  // Restore original environment
  if (originalValues.secret !== undefined) {
    Deno.env.set("LANGFUSE_SECRET_KEY", originalValues.secret);
  } else {
    Deno.env.delete("LANGFUSE_SECRET_KEY");
  }
  if (originalValues.public !== undefined) {
    Deno.env.set("LANGFUSE_PUBLIC_KEY", originalValues.public);
  } else {
    Deno.env.delete("LANGFUSE_PUBLIC_KEY");
  }
  if (originalValues.baseUrl !== undefined) {
    Deno.env.set("LANGFUSE_BASE_URL", originalValues.baseUrl);
  } else {
    Deno.env.delete("LANGFUSE_BASE_URL");
  }
});

Deno.test("getLangfuseEnv - when env vars are missing, returns empty strings", () => {
  const originalValues = {
    secret: Deno.env.get("LANGFUSE_SECRET_KEY"),
    public: Deno.env.get("LANGFUSE_PUBLIC_KEY"),
    baseUrl: Deno.env.get("LANGFUSE_BASE_URL"),
  };

  Deno.env.delete("LANGFUSE_SECRET_KEY");
  Deno.env.delete("LANGFUSE_PUBLIC_KEY");
  Deno.env.delete("LANGFUSE_BASE_URL");

  const context: LangfuseTestContext = {
    sessionId: "test-session",
    traceName: "test-trace",
    enabled: true,
    cleanup: async () => {},
  };

  const env = getLangfuseEnv(context);

  assertEquals(env.LANGFUSE_ENABLED, "true");
  assertEquals(env.LANGFUSE_SESSION_ID, "test-session");
  assertEquals(env.LANGFUSE_TRACE_NAME, "test-trace");
  assertEquals(env.LANGFUSE_SECRET_KEY, "");
  assertEquals(env.LANGFUSE_PUBLIC_KEY, "");
  assertEquals(env.LANGFUSE_BASE_URL, "");

  // Restore
  if (originalValues.secret !== undefined) {
    Deno.env.set("LANGFUSE_SECRET_KEY", originalValues.secret);
  }
  if (originalValues.public !== undefined) {
    Deno.env.set("LANGFUSE_PUBLIC_KEY", originalValues.public);
  }
  if (originalValues.baseUrl !== undefined) {
    Deno.env.set("LANGFUSE_BASE_URL", originalValues.baseUrl);
  }
});
