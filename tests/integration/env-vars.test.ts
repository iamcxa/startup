// tests/integration/env-vars.test.ts
/**
 * Tests that call-launched Claude has correct environment variables.
 */

import { assertStringIncludes } from '@std/assert';

Deno.test({
  name: 'call --dry-run shows STARTUP environment variables',
  async fn() {
    const cmd = new Deno.Command('deno', {
      args: [
        'run',
        '--allow-all',
        'startup.ts',
        'call',
        'designer',
        '--claim',
        'pd-envtest',
        '--task',
        'Test task',
        '--dry-run',
      ],
      stdout: 'piped',
      stderr: 'piped',
      cwd: Deno.cwd(),
    });

    const { stdout } = await cmd.output();
    const output = new TextDecoder().decode(stdout);

    assertStringIncludes(output, 'STARTUP_BD=');
    assertStringIncludes(output, 'pd-envtest');
    assertStringIncludes(output, 'STARTUP_ROLE=');
    assertStringIncludes(output, 'designer');
    assertStringIncludes(output, 'STARTUP_BIN=');
  },
});
