// tests/integration/poc-flow.test.ts

import { assertEquals } from '@std/assert';

/**
 * Integration test for POC flow.
 * Tests: Hook → Claim Agent spawn → Answer → Surveyor spawn → Output
 *
 * Note: This test requires bd CLI to be available.
 */

Deno.test('POC Integration: Hook dispatcher parses bd comments correctly', async () => {
  const { parseComment, getDispatchAction } = await import(
    '../../src/startup/hooks/dispatcher.ts'
  );

  // Test QUESTION triggers claim-agent spawn
  const q = parseComment('QUESTION: Which database?');
  const qAction = getDispatchAction(q.prefix, q.content);
  assertEquals(qAction.type, 'spawn');
  assertEquals(qAction.role, 'claim-agent');

  // Test SPAWN triggers role spawn
  const s = parseComment('SPAWN: designer --task "Design auth"');
  const sAction = getDispatchAction(s.prefix, s.content);
  assertEquals(sAction.type, 'spawn');
  assertEquals(sAction.role, 'designer');
  assertEquals(sAction.task, 'Design auth');

  // Test OUTPUT triggers notify
  const o = parseComment('OUTPUT: design=docs/plans/auth.md');
  const oAction = getDispatchAction(o.prefix, o.content);
  assertEquals(oAction.type, 'notify');
});

Deno.test('POC Integration: Company command returns correct status', async () => {
  const cmd = new Deno.Command('deno', {
    args: ['run', '--allow-all', 'startup.ts', 'company', 'status'],
    stdout: 'piped',
    stderr: 'piped',
    cwd: Deno.cwd(),
  });

  const result = await cmd.output();
  const output = new TextDecoder().decode(result.stdout);

  // Should contain status line
  assertEquals(output.includes('Status:'), true);
});

Deno.test('POC Integration: List command works without sessions', async () => {
  const cmd = new Deno.Command('deno', {
    args: ['run', '--allow-all', 'startup.ts', 'list'],
    stdout: 'piped',
    stderr: 'piped',
    cwd: Deno.cwd(),
  });

  const result = await cmd.output();
  const output = new TextDecoder().decode(result.stdout);

  // Should either show sessions or "No Startup sessions found"
  const hasContent = output.includes('Startup') || output.includes('No Startup sessions');
  assertEquals(hasContent, true);
});
