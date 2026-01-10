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
      PAYDIRT_HOOK_SYNC: '1',
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
  name: 'hook exits silently without PAYDIRT_BIN',
  async fn() {
    // When PAYDIRT_BIN is not set, the hook should exit immediately with success
    const result = await runHookWithInput(
      'some random output',
      {}, // No PAYDIRT_BIN
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
      { PAYDIRT_BIN: 'echo', PAYDIRT_CLAIM: 'pd-123' },
    );
    assertEquals(result.success, true);
    assertEquals(result.stdout, '');
  },
});

Deno.test({
  name: 'hook parses SPAWN comment correctly',
  async fn() {
    // Use echo as PAYDIRT_BIN to capture what would be called
    const result = await runHookWithInput(
      'bd comments add pd-123 "SPAWN: surveyor"',
      {
        PAYDIRT_BIN: 'echo',
        PAYDIRT_CLAIM: 'pd-123',
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
        PAYDIRT_BIN: 'echo',
        PAYDIRT_CLAIM: 'pd-boss',
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
        PAYDIRT_BIN: 'echo',
        PAYDIRT_CLAIM: 'pd-123',
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
        PAYDIRT_BIN: 'echo',
        PAYDIRT_CLAIM: 'pd-123',
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
        PAYDIRT_BIN: 'echo',
        PAYDIRT_CLAIM: 'pd-boss',
      },
    );
    assertEquals(result.success, true);
    assertStringIncludes(result.stdout, 'prospect');
    assertStringIncludes(result.stdout, 'miner');
    assertStringIncludes(result.stdout, '--claim');
    assertStringIncludes(result.stdout, 'pd-other');
  },
});
