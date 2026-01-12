// tests/integration/zellij-ui.test.ts
/**
 * Integration tests for Zellij UI functions.
 * NOTE: Requires zellij to be installed.
 */

import { assertEquals } from '@std/assert';
import {
  addRolePaneToTeam,
  addTeamTab,
  focusTeamRole,
  sessionExists,
  STARTUP_SESSION,
} from '../../src/startup/boomtown/zellij.ts';

// Skip if zellij not installed
async function zellijInstalled(): Promise<boolean> {
  try {
    const cmd = new Deno.Command('zellij', { args: ['--version'], stdout: 'null', stderr: 'null' });
    const result = await cmd.output();
    return result.success;
  } catch {
    return false;
  }
}

Deno.test({
  name: 'STARTUP_SESSION constant is defined',
  fn() {
    assertEquals(STARTUP_SESSION, 'startup');
  },
});

Deno.test({
  name: 'sessionExists returns false for non-existent session',
  async fn() {
    if (!await zellijInstalled()) {
      console.log('Skipping: zellij not installed');
      return;
    }

    const exists = await sessionExists('nonexistent-session-xyz');
    assertEquals(exists, false);
  },
});

Deno.test({
  name: 'addTeamTab handles no active zellij context gracefully',
  async fn() {
    if (!await zellijInstalled()) {
      console.log('Skipping: zellij not installed');
      return;
    }

    // When zellij is installed but we're not running inside a session,
    // actions may complete with exit code 0 but not actually do anything.
    // The function should not throw and return a boolean result.
    const result = await addTeamTab('test-team-nonexistent', 'Test Team');
    assertEquals(typeof result, 'boolean');
  },
});

Deno.test({
  name: 'addRolePaneToTeam handles no active context gracefully',
  async fn() {
    if (!await zellijInstalled()) {
      console.log('Skipping: zellij not installed');
      return;
    }

    // When not running inside a zellij session, zellij actions return
    // exit code 0 but don't do anything (prints "Please specify session").
    // The function should not throw and return a boolean result.
    const result = await addRolePaneToTeam('nonexistent-team-xyz', 'engineer');
    assertEquals(typeof result, 'boolean');
  },
});

Deno.test({
  name: 'focusTeamRole handles no active context gracefully',
  async fn() {
    if (!await zellijInstalled()) {
      console.log('Skipping: zellij not installed');
      return;
    }

    // When not running inside a zellij session, zellij actions return
    // exit code 0 but don't do anything (prints "Please specify session").
    // The function should not throw and return a boolean result.
    const result = await focusTeamRole('nonexistent-team-xyz', 'product');
    assertEquals(typeof result, 'boolean');
  },
});
