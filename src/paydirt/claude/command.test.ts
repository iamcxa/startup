// src/paydirt/claude/command.test.ts
import { assertEquals, assertStringIncludes } from '@std/assert';
import { buildClaudeCommand, buildPaydirtEnvVars, shellEscape } from './command.ts';

Deno.test('buildPaydirtEnvVars includes required variables', () => {
  const vars = buildPaydirtEnvVars({
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
    paydirtInstallDir: '/opt/paydirt',
    userProjectDir: '/home/user/project',
    prompt: 'Test task',
  });

  assertStringIncludes(cmd, "--plugin-dir '/opt/paydirt'");
});

Deno.test('buildClaudeCommand includes --add-dir flags', () => {
  const cmd = buildClaudeCommand({
    role: 'miner',
    claimId: 'pd-001',
    caravanName: 'test',
    paydirtInstallDir: '/opt/paydirt',
    userProjectDir: '/home/user/project',
    prompt: 'Test task',
  });

  assertStringIncludes(cmd, "--add-dir '/opt/paydirt'");
  assertStringIncludes(cmd, "--add-dir '/home/user/project'");
});

Deno.test('buildClaudeCommand includes --agent flag', () => {
  const cmd = buildClaudeCommand({
    role: 'miner',
    claimId: 'pd-001',
    caravanName: 'test',
    paydirtInstallDir: '/opt/paydirt',
    userProjectDir: '/home/user/project',
    prompt: 'Test task',
  });

  assertStringIncludes(cmd, '--agent');
  assertStringIncludes(cmd, '/opt/paydirt/prospects/miner.md');
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
    paydirtInstallDir: '/opt/paydirt',
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
    paydirtInstallDir: '/opt/paydirt',
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
    paydirtInstallDir: '/opt/pay dirt',
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
      paydirtInstallDir: '/opt/paydirt',
      userProjectDir: '/home/user/project',
      prompt: 'Test prompt',
      paydirtBinPath: '/opt/paydirt/paydirt',
    });

    assertStringIncludes(command, 'STARTUP_BD=');
    assertStringIncludes(command, 'pd-test123');
    assertStringIncludes(command, 'STARTUP_BIN=');
    assertStringIncludes(command, '/opt/paydirt/paydirt');
    assertStringIncludes(command, 'STARTUP_ROLE=');
    assertStringIncludes(command, 'trail-boss');
  },
});
