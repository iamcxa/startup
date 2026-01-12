// tests/integration/hook-dispatch.test.ts
/**
 * Tests for hook dispatch logic.
 * Verifies that the hook script correctly parses comments and spawns agents.
 */

import { assertEquals, assertStringIncludes } from '@std/assert';

async function runHookWithInput(
  toolInput: string,
  env: Record<string, string>,
): Promise<{ stdout: string; stderr: string; success: boolean }> {
  // CLAUDE_TOOL_INPUT contains the bash command that was executed
  const cmd = new Deno.Command('bash', {
    args: ['hooks/post-tool-use.sh'],
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'piped',
    env: {
      ...Deno.env.toObject(),
      ...env,
      STARTUP_HOOK_SYNC: '1',
      CLAUDE_TOOL_INPUT: toolInput,
    },
    cwd: Deno.cwd(),
  });

  const child = cmd.spawn();
  // Hook consumes stdin but doesn't use it - send empty
  const writer = child.stdin.getWriter();
  await writer.close();

  const { stdout, stderr, success } = await child.output();
  return {
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
    success,
  };
}

Deno.test({
  name: 'hook exits silently without STARTUP_BIN',
  async fn() {
    // When STARTUP_BIN is not set, the hook should exit immediately with success
    const result = await runHookWithInput(
      'some random output',
      {}, // No STARTUP_BIN
    );
    assertEquals(result.success, true);
    assertEquals(result.stdout, '');
  },
});

Deno.test({
  name: 'hook exits silently for non-bd commands',
  async fn() {
    const result = await runHookWithInput(
      'echo "hello world"',
      { STARTUP_BIN: 'echo', STARTUP_BD: 'pd-123' },
    );
    assertEquals(result.success, true);
    assertEquals(result.stdout, '');
  },
});

Deno.test({
  name: 'hook parses SPAWN comment correctly',
  async fn() {
    // Use echo as STARTUP_BIN to capture what would be called
    const result = await runHookWithInput(
      'bd comments add pd-123 "SPAWN: surveyor"',
      {
        STARTUP_BIN: 'echo',
        STARTUP_BD: 'pd-123',
      },
    );
    assertEquals(result.success, true);
    // Echo will print the command that would be executed
    assertStringIncludes(result.stdout, 'prospect');
    assertStringIncludes(result.stdout, 'surveyor');
    assertStringIncludes(result.stdout, '--claim');
    assertStringIncludes(result.stdout, 'pd-123');
  },
});

Deno.test({
  name: 'hook handles SPAWN trail-boss for new caravan',
  async fn() {
    // trail-boss with a simple task (no nested quotes)
    const result = await runHookWithInput(
      'bd comments add pd-boss "SPAWN: trail-boss --task Build-auth-system"',
      {
        STARTUP_BIN: 'echo',
        STARTUP_BD: 'pd-boss',
      },
    );
    assertEquals(result.success, true);
    assertStringIncludes(result.stdout, 'stake');
  },
});

Deno.test({
  name: 'hook handles QUESTION by spawning claim-agent',
  async fn() {
    const result = await runHookWithInput(
      'bd comments add pd-123 "QUESTION: Which database?"',
      {
        STARTUP_BIN: 'echo',
        STARTUP_BD: 'pd-123',
      },
    );
    assertEquals(result.success, true);
    assertStringIncludes(result.stdout, 'prospect');
    assertStringIncludes(result.stdout, 'claim-agent');
  },
});

Deno.test({
  name: 'hook ignores ANSWER prefix',
  async fn() {
    const result = await runHookWithInput(
      'bd comments add pd-123 "ANSWER: The database is PostgreSQL"',
      {
        STARTUP_BIN: 'echo',
        STARTUP_BD: 'pd-123',
      },
    );
    assertEquals(result.success, true);
    assertEquals(result.stdout, ''); // Should not spawn anything
  },
});

Deno.test({
  name: 'hook handles SPAWN with --claim to different caravan',
  async fn() {
    const result = await runHookWithInput(
      'bd comments add pd-boss "SPAWN: miner --claim pd-other"',
      {
        STARTUP_BIN: 'echo',
        STARTUP_BD: 'pd-boss',
      },
    );
    assertEquals(result.success, true);
    assertStringIncludes(result.stdout, 'prospect');
    assertStringIncludes(result.stdout, 'miner');
    assertStringIncludes(result.stdout, '--claim');
    assertStringIncludes(result.stdout, 'pd-other');
  },
});

Deno.test({
  name: 'hook spawns PM for pd:decision issue creation',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Test that the hook detects bd create with pd:decision label
    // and would spawn PM agent
    const env = {
      STARTUP_BIN: 'echo', // Use echo to capture what would be executed
      STARTUP_BD: 'pd-test123',
      STARTUP_HOOK_SYNC: '1',
      CLAUDE_TOOL_INPUT: 'bd create --title "DECISION: Which auth?" --label pd:decision',
      CLAUDE_TOOL_OUTPUT: 'Created issue: pd-dec456',
    };

    const hookPath = Deno.cwd() + '/hooks/post-tool-use.sh';
    const cmd = new Deno.Command('bash', {
      args: [hookPath],
      stdin: 'piped',
      stdout: 'piped',
      stderr: 'piped',
      env,
    });

    const process = cmd.spawn();
    const writer = process.stdin.getWriter();
    await writer.write(new TextEncoder().encode(''));
    await writer.close();

    const { stdout } = await process.output();
    const output = new TextDecoder().decode(stdout);

    // Verify it would spawn PM with correct arguments
    assertEquals(output.includes('prospect'), true, 'Should call prospect command');
    assertEquals(output.includes('pm'), true, 'Should spawn PM agent');
    assertEquals(output.includes('pd-dec456'), true, 'Should use decision issue ID');
  },
});
