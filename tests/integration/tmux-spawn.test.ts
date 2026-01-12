// tests/integration/tmux-spawn.test.ts
/**
 * Tests for tmux session/window creation via CLI commands.
 * Verifies that call commands actually create tmux sessions.
 *
 * NOTE: These tests create real tmux sessions and clean them up afterward.
 * They require tmux to be installed and available.
 */

import { assertEquals, assertExists, assertStringIncludes } from '@std/assert';

const TEST_CLAIM_ID = 'test-spawn';
const TEST_SESSION = `startup-${TEST_CLAIM_ID}`;

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Clean up test tmux session.
 */
async function cleanupTestSession(sessionName: string = TEST_SESSION): Promise<void> {
  const cmd = new Deno.Command('tmux', {
    args: ['kill-session', '-t', sessionName],
    stdout: 'null',
    stderr: 'null',
  });
  await cmd.output();
}

/**
 * Check if a tmux session exists.
 */
async function sessionExists(sessionName: string): Promise<boolean> {
  const cmd = new Deno.Command('tmux', {
    args: ['has-session', '-t', sessionName],
    stdout: 'null',
    stderr: 'null',
  });
  const result = await cmd.output();
  return result.success;
}

/**
 * List windows in a tmux session.
 */
async function listWindows(sessionName: string): Promise<string[]> {
  const cmd = new Deno.Command('tmux', {
    args: ['list-windows', '-t', sessionName, '-F', '#{window_name}'],
    stdout: 'piped',
    stderr: 'null',
  });

  const { stdout, success } = await cmd.output();
  if (!success) return [];

  return new TextDecoder().decode(stdout).trim().split('\n').filter(Boolean);
}

/**
 * Get session info.
 */
async function getSessionInfo(sessionName: string): Promise<{
  exists: boolean;
  windowCount: number;
  windows: string[];
}> {
  const exists = await sessionExists(sessionName);
  if (!exists) {
    return { exists: false, windowCount: 0, windows: [] };
  }

  const windows = await listWindows(sessionName);
  return {
    exists: true,
    windowCount: windows.length,
    windows,
  };
}

/**
 * Create a simple tmux session for testing.
 */
async function createTestSession(sessionName: string, windowName: string = 'initial'): Promise<boolean> {
  const cmd = new Deno.Command('tmux', {
    args: ['new-session', '-d', '-s', sessionName, '-n', windowName],
    stdout: 'null',
    stderr: 'null',
  });
  const result = await cmd.output();
  return result.success;
}

// ============================================================================
// Session Creation Tests
// ============================================================================

Deno.test({
  name: 'call command with --dry-run shows Claude command without creating session',
  async fn() {
    await cleanupTestSession();

    try {
      const cmd = new Deno.Command('deno', {
        args: [
          'run', '--allow-all', 'startup.ts',
          'call', 'designer', 'Test task',
          '--claim', TEST_CLAIM_ID,
          '--dry-run',
        ],
        stdout: 'piped',
        stderr: 'piped',
        cwd: Deno.cwd(),
      });

      const { stdout } = await cmd.output();
      const output = new TextDecoder().decode(stdout);

      // Should show dry-run output
      assertStringIncludes(output, 'DRY RUN');
      assertStringIncludes(output, 'claude');

      // Session should NOT exist
      const exists = await sessionExists(TEST_SESSION);
      assertEquals(exists, false, 'Session should not be created in dry-run mode');
    } finally {
      await cleanupTestSession();
    }
  },
});

Deno.test({
  name: 'call command creates new tmux session when none exists',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await cleanupTestSession();

    try {
      // Run call command with --background to not attach
      const cmd = new Deno.Command('deno', {
        args: [
          'run', '--allow-all', 'startup.ts',
          'call', 'designer', 'Test task',
          '--claim', TEST_CLAIM_ID,
          '--background',
        ],
        stdout: 'piped',
        stderr: 'piped',
        cwd: Deno.cwd(),
      });

      const { stdout, success } = await cmd.output();
      const output = new TextDecoder().decode(stdout);

      // Command should succeed
      assertEquals(success, true, `Command should succeed. Output: ${output}`);

      // Session should be created
      const info = await getSessionInfo(TEST_SESSION);
      assertEquals(info.exists, true, 'Session should exist');

      // Should have the surveyor window (designer maps to internal surveyor role)
      assertEquals(
        info.windows.some((w) => w.includes('surveyor')),
        true,
        `Should have surveyor window. Windows: ${info.windows.join(', ')}`,
      );
    } finally {
      await cleanupTestSession();
    }
  },
});

Deno.test({
  name: 'call command adds window to existing session',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await cleanupTestSession();

    try {
      // First create an existing session
      const created = await createTestSession(TEST_SESSION, 'initial');
      assertEquals(created, true, 'Should create initial session');

      const initialInfo = await getSessionInfo(TEST_SESSION);
      assertEquals(initialInfo.windowCount, 1, 'Should have 1 window initially');

      // Now add a second call
      const cmd = new Deno.Command('deno', {
        args: [
          'run', '--allow-all', 'startup.ts',
          'call', 'engineer', 'Second task',
          '--claim', TEST_CLAIM_ID,
          '--background',
        ],
        stdout: 'piped',
        stderr: 'piped',
        cwd: Deno.cwd(),
      });

      await cmd.output();

      // Should now have 2 windows
      const finalInfo = await getSessionInfo(TEST_SESSION);
      assertEquals(finalInfo.windowCount, 2, 'Should have 2 windows after adding call');

      // Verify window names
      assertEquals(
        finalInfo.windows.some((w) => w.includes('initial')),
        true,
        'Should still have initial window',
      );
      assertEquals(
        finalInfo.windows.some((w) => w.includes('miner')),
        true,
        'Should have miner window (engineer maps to internal miner role)',
      );
    } finally {
      await cleanupTestSession();
    }
  },
});

// ============================================================================
// Company Daemon Tests
// ============================================================================

Deno.test({
  name: 'company status command works',
  async fn() {
    const cmd = new Deno.Command('deno', {
      args: ['run', '--allow-all', 'startup.ts', 'company', 'status'],
      stdout: 'piped',
      stderr: 'piped',
      cwd: Deno.cwd(),
    });

    const { stdout, success } = await cmd.output();
    const output = new TextDecoder().decode(stdout);

    assertEquals(success, true);
    assertStringIncludes(output, 'Status:');
    assertStringIncludes(output, 'startup-company');
  },
});

Deno.test({
  name: 'company start creates startup-company session',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Clean up any existing company session
    await cleanupTestSession('startup-company');

    try {
      const cmd = new Deno.Command('deno', {
        args: ['run', '--allow-all', 'startup.ts', 'company', 'start'],
        stdout: 'piped',
        stderr: 'piped',
        cwd: Deno.cwd(),
      });

      const { stdout, success } = await cmd.output();
      const output = new TextDecoder().decode(stdout);

      assertEquals(success, true, `Command should succeed. Output: ${output}`);

      // startup-company session should exist
      const exists = await sessionExists('startup-company');
      assertEquals(exists, true, 'startup-company session should exist');
    } finally {
      await cleanupTestSession('startup-company');
    }
  },
});

Deno.test({
  name: 'company stop kills startup-company session',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // First create the company session
    await createTestSession('startup-company', 'cto');

    const existsBefore = await sessionExists('startup-company');
    assertEquals(existsBefore, true, 'startup-company should exist before stop');

    // Stop the company
    const cmd = new Deno.Command('deno', {
      args: ['run', '--allow-all', 'startup.ts', 'company', 'stop'],
      stdout: 'piped',
      stderr: 'piped',
      cwd: Deno.cwd(),
    });

    await cmd.output();

    // startup-company should no longer exist
    const existsAfter = await sessionExists('startup-company');
    assertEquals(existsAfter, false, 'startup-company should not exist after stop');
  },
});

// ============================================================================
// List Command Tests
// ============================================================================

Deno.test({
  name: 'list command shows startup sessions',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await cleanupTestSession();

    try {
      // Create a test session
      await createTestSession(TEST_SESSION, 'test-window');

      const cmd = new Deno.Command('deno', {
        args: ['run', '--allow-all', 'startup.ts', 'list'],
        stdout: 'piped',
        stderr: 'piped',
        cwd: Deno.cwd(),
      });

      const { stdout } = await cmd.output();
      const output = new TextDecoder().decode(stdout);

      // Should show our test session
      assertStringIncludes(output, TEST_SESSION);
    } finally {
      await cleanupTestSession();
    }
  },
});

Deno.test({
  name: 'list command shows helpful message when no sessions',
  async fn() {
    // Kill all startup sessions first
    await cleanupTestSession();
    await cleanupTestSession('startup-company');

    // Kill any other startup sessions
    const listCmd = new Deno.Command('tmux', {
      args: ['list-sessions', '-F', '#{session_name}'],
      stdout: 'piped',
      stderr: 'null',
    });
    const { stdout: listStdout } = await listCmd.output();
    const sessions = new TextDecoder().decode(listStdout).trim().split('\n');
    for (const session of sessions) {
      if (session.startsWith('startup-')) {
        await cleanupTestSession(session);
      }
    }

    const cmd = new Deno.Command('deno', {
      args: ['run', '--allow-all', 'startup.ts', 'list'],
      stdout: 'piped',
      stderr: 'piped',
      cwd: Deno.cwd(),
    });

    const { stdout } = await cmd.output();
    const output = new TextDecoder().decode(stdout);

    // Should show helpful message or session list
    const hasContent = output.includes('Startup') || output.includes('No Startup');
    assertEquals(hasContent, true, 'Should show some output');
  },
});

// ============================================================================
// Attach Command Tests
// ============================================================================

Deno.test({
  name: 'attach command lists sessions when no target specified',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await cleanupTestSession();

    try {
      // Create a test session
      await createTestSession(TEST_SESSION, 'test-window');

      const cmd = new Deno.Command('deno', {
        args: ['run', '--allow-all', 'startup.ts', 'attach'],
        stdout: 'piped',
        stderr: 'piped',
        cwd: Deno.cwd(),
      });

      const { stdout } = await cmd.output();
      const output = new TextDecoder().decode(stdout);

      // Should list available sessions
      assertStringIncludes(output, TEST_SESSION);
    } finally {
      await cleanupTestSession();
    }
  },
});

Deno.test({
  name: 'attach command shows error for non-existent session',
  async fn() {
    await cleanupTestSession('startup-nonexistent');

    const cmd = new Deno.Command('deno', {
      args: ['run', '--allow-all', 'startup.ts', 'attach', 'nonexistent'],
      stdout: 'piped',
      stderr: 'piped',
      cwd: Deno.cwd(),
    });

    const { stderr, success } = await cmd.output();
    const output = new TextDecoder().decode(stderr);

    // Should fail and show error
    assertEquals(success, false, 'Should fail for non-existent session');
    assertStringIncludes(output.toLowerCase(), 'not found');
  },
});
