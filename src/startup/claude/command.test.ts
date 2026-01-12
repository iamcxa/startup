// src/startup/claude/command.test.ts
import { assertEquals, assertStringIncludes } from '@std/assert';
import { buildClaudeCommand, buildStartupEnvVars, shellEscape } from './command.ts';

Deno.test('buildStartupEnvVars includes required variables', () => {
  const vars = buildStartupEnvVars({
    role: 'trail-boss',
    claimId: 'pd-001',
    caravanName: 'test-caravan',
  });

  assertEquals(vars.STARTUP_ROLE, 'trail-boss');
  assertEquals(vars.STARTUP_BD, 'pd-001');
  assertEquals(vars.STARTUP_CONVOY, 'test-caravan');
  assertEquals(vars.STARTUP_SESSION, 'startup-pd-001');
});

Deno.test('buildClaudeCommand includes --plugin-dir flag', () => {
  const cmd = buildClaudeCommand({
    role: 'miner',
    claimId: 'pd-001',
    caravanName: 'test',
    startupInstallDir: '/opt/startup',
    userProjectDir: '/home/user/project',
    prompt: 'Test task',
  });

  assertStringIncludes(cmd, "--plugin-dir '/opt/startup'");
});

Deno.test('buildClaudeCommand includes --add-dir flags', () => {
  const cmd = buildClaudeCommand({
    role: 'miner',
    claimId: 'pd-001',
    caravanName: 'test',
    startupInstallDir: '/opt/startup',
    userProjectDir: '/home/user/project',
    prompt: 'Test task',
  });

  assertStringIncludes(cmd, "--add-dir '/opt/startup'");
  assertStringIncludes(cmd, "--add-dir '/home/user/project'");
});

Deno.test('buildClaudeCommand includes --agent flag', () => {
  const cmd = buildClaudeCommand({
    role: 'miner',
    claimId: 'pd-001',
    caravanName: 'test',
    startupInstallDir: '/opt/startup',
    userProjectDir: '/home/user/project',
    prompt: 'Test task',
  });

  assertStringIncludes(cmd, '--agent');
  assertStringIncludes(cmd, '/opt/startup/prospects/miner.md');
});

Deno.test('shellEscape handles single quotes', () => {
  const result = shellEscape("it's");
  assertEquals(result, "'it'\\''s'");
});

Deno.test('buildClaudeCommand includes --resume when specified', () => {
  const cmd = buildClaudeCommand({
    role: 'miner',
    claimId: 'pd-001',
    caravanName: 'test',
    startupInstallDir: '/opt/startup',
    userProjectDir: '/home/user/project',
    prompt: 'Test task',
    resume: true,
  });
  assertStringIncludes(cmd, '--resume');
});

Deno.test('buildClaudeCommand includes --dangerously-skip-permissions when specified', () => {
  const cmd = buildClaudeCommand({
    role: 'miner',
    claimId: 'pd-001',
    caravanName: 'test',
    startupInstallDir: '/opt/startup',
    userProjectDir: '/home/user/project',
    prompt: 'Test task',
    dangerouslySkipPermissions: true,
  });
  assertStringIncludes(cmd, '--dangerously-skip-permissions');
});

Deno.test('buildClaudeCommand escapes paths with spaces', () => {
  const cmd = buildClaudeCommand({
    role: 'miner',
    claimId: 'pd-001',
    caravanName: 'test',
    startupInstallDir: '/opt/start up',
    userProjectDir: '/home/user/my project',
    prompt: 'Test task',
  });
  assertStringIncludes(cmd, "'"); // Should have quotes for escaping
});

Deno.test({
  name: 'buildClaudeCommand includes STARTUP environment variables',
  fn() {
    const command = buildClaudeCommand({
      role: 'trail-boss',
      claimId: 'pd-test123',
      caravanName: 'test-caravan',
      startupInstallDir: '/opt/startup',
      userProjectDir: '/home/user/project',
      prompt: 'Test prompt',
      startupBinPath: '/opt/startup/startup',
    });

    assertStringIncludes(command, 'STARTUP_BD=');
    assertStringIncludes(command, 'pd-test123');
    assertStringIncludes(command, 'STARTUP_BIN=');
    assertStringIncludes(command, '/opt/startup/startup');
    assertStringIncludes(command, 'STARTUP_ROLE=');
    assertStringIncludes(command, 'trail-boss');
  },
});
