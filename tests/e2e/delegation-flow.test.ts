// tests/e2e/delegation-flow.test.ts
/**
 * E2E test for the full delegation flow.
 * Tests: Trail Boss → SPAWN surveyor → tmux window created
 */

import { assertEquals } from '@std/assert';

async function createTestClaim(title: string): Promise<string> {
  const cmd = new Deno.Command('bd', {
    args: ['create', '--title', title, '--type', 'task'],
    stdout: 'piped',
    stderr: 'piped',
  });

  const { stdout } = await cmd.output();
  const output = new TextDecoder().decode(stdout).trim();
  const match = output.match(/Created issue:\s*(\S+)/);
  return match ? match[1] : '';
}

async function closeClaim(claimId: string): Promise<void> {
  const cmd = new Deno.Command('bd', {
    args: ['close', claimId, '--reason', 'E2E test cleanup'],
    stdout: 'null',
    stderr: 'null',
  });
  await cmd.output();
}

async function cleanupTmuxSession(sessionName: string): Promise<void> {
  const cmd = new Deno.Command('tmux', {
    args: ['kill-session', '-t', sessionName],
    stdout: 'null',
    stderr: 'null',
  });
  await cmd.output();
}

async function createTmuxSession(
  sessionName: string,
  windowName: string,
): Promise<boolean> {
  const cmd = new Deno.Command('tmux', {
    args: ['new-session', '-d', '-s', sessionName, '-n', windowName],
    stdout: 'null',
    stderr: 'null',
  });
  return (await cmd.output()).success;
}

async function listTmuxWindows(sessionName: string): Promise<string[]> {
  const cmd = new Deno.Command('tmux', {
    args: ['list-windows', '-t', sessionName, '-F', '#{window_name}'],
    stdout: 'piped',
    stderr: 'null',
  });

  const { stdout, success } = await cmd.output();
  if (!success) return [];

  return new TextDecoder().decode(stdout).trim().split('\n').filter(Boolean);
}

Deno.test({
  name: 'E2E: prospect command adds window to existing caravan session',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const claimId = await createTestClaim('E2E Delegation Test');
    const sessionName = `startup-${claimId}`;

    try {
      // Step 1: Create initial session (simulating Trail Boss)
      const created = await createTmuxSession(sessionName, 'trail-boss');
      assertEquals(created, true, 'Should create initial session');

      // Step 2: Spawn surveyor (simulating SPAWN command)
      const cmd = new Deno.Command('deno', {
        args: [
          'run',
          '--allow-all',
          'startup.ts',
          'prospect',
          'surveyor',
          '--claim',
          claimId,
          '--task',
          'Design the system',
          '--background',
        ],
        stdout: 'piped',
        stderr: 'piped',
        cwd: Deno.cwd(),
      });

      const { success } = await cmd.output();
      assertEquals(success, true, 'Prospect command should succeed');

      // Step 3: Verify surveyor window exists
      const windows = await listTmuxWindows(sessionName);
      assertEquals(windows.length, 2, 'Should have 2 windows');
      assertEquals(
        windows.includes('surveyor'),
        true,
        'Should have surveyor window',
      );

      // Step 4: Spawn miner
      const cmd2 = new Deno.Command('deno', {
        args: [
          'run',
          '--allow-all',
          'startup.ts',
          'prospect',
          'miner',
          '--claim',
          claimId,
          '--task',
          'Implement feature',
          '--background',
        ],
        stdout: 'piped',
        stderr: 'piped',
        cwd: Deno.cwd(),
      });

      await cmd2.output();

      // Step 5: Verify miner window exists
      const finalWindows = await listTmuxWindows(sessionName);
      assertEquals(finalWindows.length, 3, 'Should have 3 windows');
      assertEquals(
        finalWindows.includes('miner'),
        true,
        'Should have miner window',
      );
    } finally {
      await cleanupTmuxSession(sessionName);
      await closeClaim(claimId);
    }
  },
});

Deno.test({
  name: 'E2E: prospect creates new session when none exists',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const claimId = await createTestClaim('E2E New Session Test');
    const sessionName = `startup-${claimId}`;

    try {
      // Spawn surveyor without existing session
      const cmd = new Deno.Command('deno', {
        args: [
          'run',
          '--allow-all',
          'startup.ts',
          'prospect',
          'surveyor',
          '--claim',
          claimId,
          '--task',
          'Design something',
          '--background',
        ],
        stdout: 'piped',
        stderr: 'piped',
        cwd: Deno.cwd(),
      });

      const { success } = await cmd.output();
      assertEquals(success, true, 'Prospect command should succeed');

      // Verify session was created
      const checkCmd = new Deno.Command('tmux', {
        args: ['has-session', '-t', sessionName],
        stdout: 'null',
        stderr: 'null',
      });
      const checkResult = await checkCmd.output();
      assertEquals(checkResult.success, true, 'Session should exist');

      // Verify surveyor window exists
      const windows = await listTmuxWindows(sessionName);
      assertEquals(windows.length, 1, 'Should have 1 window');
      assertEquals(
        windows.includes('surveyor'),
        true,
        'Should have surveyor window',
      );
    } finally {
      await cleanupTmuxSession(sessionName);
      await closeClaim(claimId);
    }
  },
});
