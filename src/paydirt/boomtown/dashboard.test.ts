// src/paydirt/boomtown/dashboard.test.ts
import { assertEquals, assertStringIncludes } from '@std/assert';
import {
  type CaravanInfo,
  findPaydirtPath,
  mapCaravanStatus,
  mapCaravansToDashboard,
  RELOAD_TRIGGER_FILE,
  requestDashboardReload,
} from './dashboard.ts';

// ========================================================================
// mapCaravanStatus Tests
// ========================================================================

Deno.test('mapCaravanStatus returns "running" when tmux session exists', () => {
  const caravan: CaravanInfo = {
    id: 'pd-001',
    title: 'Test Caravan',
    status: 'in_progress',
    labels: ['paydirt:caravan'],
    priority: 2,
    created_at: '2024-01-01T00:00:00Z',
  };
  const tmuxSessions = ['paydirt-pd-001', 'paydirt-camp-boss'];

  const status = mapCaravanStatus(caravan, tmuxSessions);

  assertEquals(status, 'running');
});

Deno.test('mapCaravanStatus returns "idle" for open caravan without session', () => {
  const caravan: CaravanInfo = {
    id: 'pd-002',
    title: 'Idle Caravan',
    status: 'open',
    labels: ['paydirt:caravan'],
    priority: 2,
    created_at: '2024-01-01T00:00:00Z',
  };
  const tmuxSessions = ['paydirt-camp-boss']; // No session for this caravan

  const status = mapCaravanStatus(caravan, tmuxSessions);

  assertEquals(status, 'idle');
});

Deno.test('mapCaravanStatus returns "idle" for in_progress caravan without session', () => {
  const caravan: CaravanInfo = {
    id: 'pd-003',
    title: 'Paused Caravan',
    status: 'in_progress',
    labels: ['paydirt:caravan'],
    priority: 1,
    created_at: '2024-01-01T00:00:00Z',
  };
  const tmuxSessions: string[] = []; // No sessions at all

  const status = mapCaravanStatus(caravan, tmuxSessions);

  assertEquals(status, 'idle');
});

Deno.test('mapCaravanStatus returns "stopped" for closed caravan', () => {
  const caravan: CaravanInfo = {
    id: 'pd-004',
    title: 'Closed Caravan',
    status: 'closed',
    labels: ['paydirt:caravan'],
    priority: 3,
    created_at: '2024-01-01T00:00:00Z',
  };
  const tmuxSessions: string[] = [];

  const status = mapCaravanStatus(caravan, tmuxSessions);

  assertEquals(status, 'stopped');
});

// ========================================================================
// mapCaravansToDashboard Tests
// ========================================================================

Deno.test('mapCaravansToDashboard converts multiple caravans', () => {
  const caravans: CaravanInfo[] = [
    {
      id: 'pd-001',
      title: 'First Caravan',
      status: 'in_progress',
      labels: ['paydirt:caravan'],
      priority: 1,
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 'pd-002',
      title: 'Second Caravan',
      status: 'open',
      labels: ['paydirt:caravan'],
      priority: 2,
      created_at: '2024-01-02T00:00:00Z',
    },
    {
      id: 'pd-003',
      title: 'Third Caravan',
      status: 'closed',
      labels: ['paydirt:caravan'],
      priority: 3,
      created_at: '2024-01-03T00:00:00Z',
    },
  ];
  const tmuxSessions = ['paydirt-pd-001']; // Only first caravan has active session

  const result = mapCaravansToDashboard(caravans, tmuxSessions);

  assertEquals(result.length, 3);

  // First caravan: in_progress with session = running
  assertEquals(result[0].id, 'pd-001');
  assertEquals(result[0].name, 'First Caravan');
  assertEquals(result[0].status, 'running');

  // Second caravan: open without session = idle
  assertEquals(result[1].id, 'pd-002');
  assertEquals(result[1].name, 'Second Caravan');
  assertEquals(result[1].status, 'idle');

  // Third caravan: closed = stopped
  assertEquals(result[2].id, 'pd-003');
  assertEquals(result[2].name, 'Third Caravan');
  assertEquals(result[2].status, 'stopped');
});

Deno.test('mapCaravansToDashboard handles empty caravan list', () => {
  const caravans: CaravanInfo[] = [];
  const tmuxSessions = ['paydirt-camp-boss'];

  const result = mapCaravansToDashboard(caravans, tmuxSessions);

  assertEquals(result.length, 0);
  assertEquals(result, []);
});

// ========================================================================
// requestDashboardReload Tests
// ========================================================================

Deno.test('requestDashboardReload creates trigger file', async () => {
  // Clean up any existing trigger file first
  try {
    await Deno.remove(RELOAD_TRIGGER_FILE);
  } catch {
    // Ignore if doesn't exist
  }

  // Request reload
  await requestDashboardReload();

  // Verify trigger file exists
  const stat = await Deno.stat(RELOAD_TRIGGER_FILE);
  assertEquals(stat.isFile, true);

  // Verify content is a valid timestamp
  const content = await Deno.readTextFile(RELOAD_TRIGGER_FILE);
  const timestamp = new Date(content);
  assertEquals(isNaN(timestamp.getTime()), false);

  // Clean up
  await Deno.remove(RELOAD_TRIGGER_FILE);
});

// ========================================================================
// RELOAD_TRIGGER_FILE Tests
// ========================================================================

Deno.test('RELOAD_TRIGGER_FILE uses correct path', () => {
  // Should contain 'paydirt' and 'reload' in the path
  assertStringIncludes(RELOAD_TRIGGER_FILE, 'paydirt');
  assertStringIncludes(RELOAD_TRIGGER_FILE, 'reload');

  // Should be in /tmp directory
  assertStringIncludes(RELOAD_TRIGGER_FILE, '/tmp/');
});

// ========================================================================
// findPaydirtPath Tests
// ========================================================================

Deno.test('findPaydirtPath prefers local binary', async () => {
  // Create a temporary paydirt binary in cwd
  const testDir = await Deno.makeTempDir({ prefix: 'paydirt-test-' });
  // Resolve symlinks (macOS /var -> /private/var)
  const resolvedTestDir = await Deno.realPath(testDir);
  const originalCwd = Deno.cwd();

  try {
    // Change to test directory
    Deno.chdir(resolvedTestDir);

    // Create a fake paydirt binary
    const localBinary = `${resolvedTestDir}/paydirt`;
    await Deno.writeTextFile(localBinary, '#!/bin/bash\necho "local paydirt"');
    await Deno.chmod(localBinary, 0o755);

    // findPaydirtPath should find the local binary first
    const foundPath = await findPaydirtPath();

    assertEquals(foundPath, localBinary);
  } finally {
    // Restore original cwd
    Deno.chdir(originalCwd);

    // Clean up test directory
    await Deno.remove(testDir, { recursive: true });
  }
});
