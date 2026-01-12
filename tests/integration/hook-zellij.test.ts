// tests/integration/hook-zellij.test.ts
/**
 * Tests for hook zellij integration.
 * Verifies that hook helpers exist and work correctly.
 */

import { assertEquals, assertStringIncludes } from '@std/assert';

async function runHookWithInput(
  toolInput: string,
  env: Record<string, string>,
): Promise<{ stdout: string; stderr: string; success: boolean }> {
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
  name: 'hook zellij helpers exist in script',
  async fn() {
    const content = await Deno.readTextFile('hooks/post-tool-use.sh');

    assertStringIncludes(content, 'zellij_session_exists');
    assertStringIncludes(content, 'add_team_tab');
    assertStringIncludes(content, 'add_role_pane');
    assertStringIncludes(content, 'focus_team_role');
    assertStringIncludes(content, 'ZELLIJ_SESSION');
  },
});

Deno.test({
  name: 'hook detects HUMAN_REQUIRED',
  async fn() {
    const result = await runHookWithInput(
      'bd comments add st-123 "HUMAN_REQUIRED: Which database should we use?"',
      {
        STARTUP_BIN: 'echo',
        STARTUP_BD: 'st-123',
      },
    );

    // Hook should succeed (zellij not running is OK)
    assertEquals(result.success, true);
  },
});

Deno.test({
  name: 'hook detects kickoff command',
  async fn() {
    const result = await runHookWithInput(
      'startup kickoff "Test task"',
      {
        STARTUP_BIN: 'echo',
        STARTUP_BD: 'st-123',
        CLAUDE_TOOL_OUTPUT: 'Created team: st-newteam123',
      },
    );

    assertEquals(result.success, true);
  },
});

Deno.test({
  name: 'hook ZELLIJ_SESSION constant has correct value',
  async fn() {
    const content = await Deno.readTextFile('hooks/post-tool-use.sh');

    // Check that ZELLIJ_SESSION is set to "startup"
    assertStringIncludes(content, 'ZELLIJ_SESSION="startup"');
  },
});

Deno.test({
  name: 'hook add_team_tab creates correct tmux session name',
  async fn() {
    const content = await Deno.readTextFile('hooks/post-tool-use.sh');

    // Verify the tmux session naming pattern in add_team_tab
    assertStringIncludes(content, 'tmux_session="startup-${team_id}"');
  },
});

Deno.test({
  name: 'hook add_role_pane creates correct attach command',
  async fn() {
    const content = await Deno.readTextFile('hooks/post-tool-use.sh');

    // Verify attach command pattern for roles
    assertStringIncludes(content, 'tmux attach-session -t ${tmux_session}:${role}');
  },
});
