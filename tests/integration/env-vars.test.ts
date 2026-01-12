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
        'Test task',
        '--claim',
        'st-envtest',
        '--dry-run',
      ],
      stdout: 'piped',
      stderr: 'piped',
      cwd: Deno.cwd(),
    });

    const { stdout } = await cmd.output();
    const output = new TextDecoder().decode(stdout);

    assertStringIncludes(output, 'STARTUP_BD=');
    assertStringIncludes(output, 'st-envtest');
    assertStringIncludes(output, 'STARTUP_ROLE=');
    assertStringIncludes(output, 'surveyor'); // designer maps to internal surveyor role
    assertStringIncludes(output, 'STARTUP_BIN=');
  },
});
