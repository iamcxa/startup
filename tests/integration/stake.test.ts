// tests/integration/stake.test.ts
import { assertStringIncludes } from '@std/assert';

Deno.test('startup call --dry-run generates correct command', async () => {
  const cmd = new Deno.Command('deno', {
    args: ['run', '--allow-all', 'startup.ts', 'stake', 'Test task', '--dry-run'],
    cwd: 'Deno.cwd()',
    stdout: 'piped',
    stderr: 'piped',
  });

  const { stdout } = await cmd.output();
  const output = new TextDecoder().decode(stdout);

  assertStringIncludes(output, '--plugin-dir');
  assertStringIncludes(output, '--add-dir');
  assertStringIncludes(output, '--agent');
  assertStringIncludes(output, 'trail-boss.md');
});
