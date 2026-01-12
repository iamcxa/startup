/**
 * Simple test to verify Langfuse tracing works
 * Run: deno run --allow-all tests/utils/langfuse-trace-test.ts
 */
import { initLangfuseForTest, withTestSpan, traceEvent } from "./langfuse.ts";

async function main() {
  console.log("=== Langfuse Trace Test ===\n");

  // Initialize Langfuse
  const langfuse = await initLangfuseForTest("langfuse-trace-test");

  console.log(`Langfuse enabled: ${langfuse.enabled}`);
  console.log(`Session ID: ${langfuse.sessionId}`);

  if (!langfuse.enabled) {
    console.log("\n❌ Langfuse is DISABLED. Check your .env.test file.");
    return;
  }

  try {
    // Create a test span
    console.log("\n1. Creating test span...");
    await withTestSpan(
      langfuse,
      "test-operation",
      {
        "test.phase": "verification",
        "test.step": 1,
      },
      async () => {
        console.log("   Inside span: doing work...");
        await new Promise((resolve) => setTimeout(resolve, 100));
        console.log("   Inside span: work complete");
        return "success";
      },
    );
    console.log("   ✓ Span created successfully");

    // Create a trace event
    console.log("\n2. Creating trace event...");
    traceEvent(langfuse, "test-milestone", {
      "milestone.name": "test-complete",
      "milestone.status": "passed",
    });
    console.log("   ✓ Event created successfully");

    // Flush and cleanup
    console.log("\n3. Flushing traces to Langfuse...");
    await langfuse.cleanup();
    console.log("   ✓ Traces flushed successfully");

    console.log("\n=== Test Complete ===");
    console.log(`\nCheck Langfuse UI for traces with session: ${langfuse.sessionId}`);
    console.log("URL: https://us.cloud.langfuse.com");
  } catch (error) {
    console.error("\n❌ Error:", error);
  }
}

main();
