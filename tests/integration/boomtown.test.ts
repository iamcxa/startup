// tests/integration/boomtown.test.ts
/**
 * Boomtown Integration Tests
 *
 * Comprehensive integration tests for the Boomtown dashboard system.
 * Tests verify that components work together correctly and test file generation.
 */

import { assertEquals, assertExists, assertNotEquals, assertStringIncludes } from '@std/assert';
import {
  type DashboardCaravanInfo,
  generateCaravanScriptContent,
  generateMprocsConfig,
  generateStatusScriptContent,
  generateWelcomeScript,
  writeMprocsConfig,
} from '../../src/startup/boomtown/mprocs.ts';
import { generateCampBossScriptContent } from '../../src/startup/boomtown/camp-boss-pane.ts';
import {
  type CaravanInfo,
  mapCaravansToDashboard,
  RELOAD_TRIGGER_FILE,
  requestDashboardReload,
} from '../../src/startup/boomtown/dashboard.ts';

// ============================================================================
// mprocs Configuration Integration Tests
// ============================================================================

Deno.test('mprocs config includes all required sections', () => {
  const teams: DashboardCaravanInfo[] = [
    { id: 'st-001', name: 'Test Team', status: 'running' },
  ];
  const config = generateMprocsConfig(
    teams,
    '/tmp/status.sh',
    new Map([['st-001', '/tmp/team.sh']]),
    '/tmp/camp-boss.sh',
  );

  // Required sections as per spec
  // Note: STARTUP is rendered as ASCII art banner (block letters)
  assertStringIncludes(config, '██████╗'); // Part of STARTUP ASCII art banner
  assertStringIncludes(config, 'BOOMTOWN');
  assertStringIncludes(config, 'proc_list_width');
  assertStringIncludes(config, 'scrollback');
  assertStringIncludes(config, 'server');
  assertStringIncludes(config, 'procs:');
  assertStringIncludes(config, 'CONTROL ROOM');
  assertStringIncludes(config, 'CAMP BOSS');
});

Deno.test('mprocs config includes Team panes with correct status glyphs', () => {
  const teams: DashboardCaravanInfo[] = [
    { id: 'st-001', name: 'Running Team', status: 'running' },
    { id: 'st-002', name: 'Idle Team', status: 'idle' },
    { id: 'st-003', name: 'Stopped Team', status: 'stopped' },
  ];
  const config = generateMprocsConfig(teams);

  // Check status glyphs: running = ▶, idle = ◇, stopped = ■
  assertStringIncludes(config, '▶ st-001');
  assertStringIncludes(config, '◇ st-002');
  assertStringIncludes(config, '■ st-003');
});

Deno.test('mprocs config shows welcome pane when no Teams', () => {
  const config = generateMprocsConfig([]);

  assertStringIncludes(config, 'WELCOME');
  assertStringIncludes(config, 'No active Caravans');
});

Deno.test('mprocs config excludes welcome pane when Teams exist', () => {
  const teams: DashboardCaravanInfo[] = [
    { id: 'st-001', name: 'Test Team', status: 'running' },
  ];
  const config = generateMprocsConfig(teams);

  assertStringIncludes(config, 'CARAVAN SESSIONS');
  // The WELCOME section header should not appear when teams exist
  // (Welcome is in WELCOME PANEL section, not CARAVAN SESSIONS)
  const hasCaravanSessions = config.includes('# CARAVAN SESSIONS');
  const hasWelcomePanel = config.includes('# WELCOME PANEL');
  assertEquals(hasCaravanSessions, true);
  assertEquals(hasWelcomePanel, false);
});

// ============================================================================
// Status Script Integration Tests
// ============================================================================

Deno.test('Control Room status script includes Gold Rush branding', () => {
  const script = generateStatusScriptContent();

  assertStringIncludes(script, 'STARTUP');
  assertStringIncludes(script, 'BOOMTOWN');
  assertStringIncludes(script, 'Assay Office');
});

Deno.test('Control Room status script includes color definitions', () => {
  const script = generateStatusScriptContent();

  // Gold Rush theme colors
  assertStringIncludes(script, '48;5;94'); // Dark brown background
  assertStringIncludes(script, '38;5;220'); // Gold foreground
});

Deno.test('Control Room status script includes system panels', () => {
  const script = generateStatusScriptContent();

  // Must have MINING CAMP STATUS (system status), CARAVAN STATUS, and ZELLIJ CONTROLS
  assertStringIncludes(script, 'MINING CAMP STATUS');
  assertStringIncludes(script, 'CARAVAN STATUS');
  assertStringIncludes(script, 'ZELLIJ CONTROLS');
});

// ============================================================================
// Team Pane Script Integration Tests
// ============================================================================

Deno.test('Team pane script includes correct session name', () => {
  const script = generateCaravanScriptContent(
    'st-abc123',
    'Test Team',
    'running',
    '/usr/bin/startup',
  );

  assertStringIncludes(script, 'SESSION_NAME="startup-st-abc123"');
  assertStringIncludes(script, 'CARAVAN_ID="st-abc123"');
});

Deno.test('Team pane script includes start functionality', () => {
  // Test that script includes start functionality
  const script = generateCaravanScriptContent(
    'st-001',
    'Test Team',
    'running',
    '/bin/startup',
  );
  assertStringIncludes(script, 'START');
  assertStringIncludes(script, 'start_caravan');
  assertStringIncludes(script, 'STARTUP_BIN');
});

Deno.test('Team pane script includes tmux attach logic', () => {
  const script = generateCaravanScriptContent('st-001', 'Test', 'running', '/bin/startup');

  assertStringIncludes(script, 'tmux has-session');
  assertStringIncludes(script, 'tmux attach');
});

// ============================================================================
// Camp Boss Pane Integration Tests
// ============================================================================

Deno.test('Camp Boss script includes Gold Rush branding', () => {
  const script = generateCampBossScriptContent(
    '/usr/bin/startup',
    '/path/to/camp-boss.md',
    '/project/root',
  );

  assertStringIncludes(script, 'STARTUP');
  assertStringIncludes(script, 'BOOMTOWN');
  assertStringIncludes(script, 'CAMP BOSS');
});

Deno.test('Camp Boss script includes session management', () => {
  const script = generateCampBossScriptContent(
    '/usr/bin/startup',
    '/path/to/camp-boss.md',
    '/project/root',
  );

  assertStringIncludes(script, 'SESSION_NAME="startup-camp-boss"');
  assertStringIncludes(script, 'tmux new-session');
  assertStringIncludes(script, 'tmux attach');
});

Deno.test('Camp Boss script includes Claude Code launch', () => {
  const script = generateCampBossScriptContent(
    '/usr/bin/startup',
    '/path/to/camp-boss.md',
    '/project/root',
  );

  assertStringIncludes(script, 'claude');
  assertStringIncludes(script, '--agent');
  assertStringIncludes(script, 'STARTUP_ROLE=camp-boss');
});

// ============================================================================
// Dashboard Status Mapping Integration Tests
// ============================================================================

Deno.test('mapCaravansToDashboard correctly combines status info', () => {
  const teams: CaravanInfo[] = [
    {
      id: 'st-001',
      title: 'Active Team',
      status: 'in_progress',
      labels: ['st:team'],
      priority: 1,
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 'st-002',
      title: 'Idle Team',
      status: 'open',
      labels: ['st:team'],
      priority: 2,
      created_at: '2024-01-02T00:00:00Z',
    },
  ];
  // st-001 has an active tmux session, st-002 does not
  const tmuxSessions = ['startup-st-001'];

  const result = mapCaravansToDashboard(teams, tmuxSessions);

  assertEquals(result.length, 2);

  // First team: has tmux session = running
  assertEquals(result[0].id, 'st-001');
  assertEquals(result[0].status, 'running');

  // Second team: no tmux session but open = idle
  assertEquals(result[1].id, 'st-002');
  assertEquals(result[1].status, 'idle');
});

// ============================================================================
// Hot-Reload Integration Tests
// ============================================================================

Deno.test('hot-reload trigger file can be created and detected', async () => {
  // Clean up any existing trigger file
  try {
    await Deno.remove(RELOAD_TRIGGER_FILE);
  } catch {
    // Ignore if doesn't exist
  }

  // Create trigger file via requestDashboardReload
  await requestDashboardReload();

  // Verify file was created
  const stat = await Deno.stat(RELOAD_TRIGGER_FILE);
  assertExists(stat);
  assertEquals(stat.isFile, true);

  // Read and verify content is ISO timestamp
  const content = await Deno.readTextFile(RELOAD_TRIGGER_FILE);
  assertExists(content);
  assertNotEquals(content, '');

  // Verify it's a valid ISO timestamp
  const timestamp = new Date(content);
  assertEquals(isNaN(timestamp.getTime()), false);

  // Clean up
  await Deno.remove(RELOAD_TRIGGER_FILE);
});

// ============================================================================
// File Generation Integration Tests
// ============================================================================

Deno.test('writeMprocsConfig creates temp directory with all scripts', async () => {
  const teams: DashboardCaravanInfo[] = [
    { id: 'st-001', name: 'Test Team 1', status: 'running' },
  ];
  const startupPath = '/usr/local/bin/startup';

  const configPath = await writeMprocsConfig(teams, startupPath);

  // Verify config file exists
  const configStat = await Deno.stat(configPath);
  assertEquals(configStat.isFile, true);

  // Extract temp directory from config path
  const tempDir = configPath.substring(0, configPath.lastIndexOf('/'));

  // Verify control-room.sh exists
  const controlRoomPath = `${tempDir}/control-room.sh`;
  const controlRoomStat = await Deno.stat(controlRoomPath);
  assertEquals(controlRoomStat.isFile, true);

  // Verify team script exists
  const teamScriptPath = `${tempDir}/caravan-st-001.sh`;
  const teamScriptStat = await Deno.stat(teamScriptPath);
  assertEquals(teamScriptStat.isFile, true);

  // Clean up
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test('generated scripts are executable', async () => {
  const teams: DashboardCaravanInfo[] = [
    { id: 'st-002', name: 'Executable Test', status: 'idle' },
  ];
  const startupPath = '/usr/local/bin/startup';

  const configPath = await writeMprocsConfig(teams, startupPath);
  const tempDir = configPath.substring(0, configPath.lastIndexOf('/'));

  // Check control-room.sh is executable
  const controlRoomPath = `${tempDir}/control-room.sh`;
  const controlRoomStat = await Deno.stat(controlRoomPath);
  // Mode should have execute bit set (0o755 includes 0o111)
  const hasExecuteBit = (controlRoomStat.mode! & 0o111) !== 0;
  assertEquals(hasExecuteBit, true);

  // Check team script is executable
  const teamScriptPath = `${tempDir}/caravan-st-002.sh`;
  const teamScriptStat = await Deno.stat(teamScriptPath);
  const teamHasExecuteBit = (teamScriptStat.mode! & 0o111) !== 0;
  assertEquals(teamHasExecuteBit, true);

  // Clean up
  await Deno.remove(tempDir, { recursive: true });
});

// ============================================================================
// Welcome Script Integration Tests
// ============================================================================

Deno.test('welcome script includes all available operations', () => {
  const script = generateWelcomeScript();

  // Required content from spec
  // Note: STARTUP is rendered as ASCII art banner (block letters), verify via character pattern
  assertStringIncludes(script, '██████╗'); // Part of STARTUP ASCII art banner
  assertStringIncludes(script, 'WELCOME TO BOOMTOWN');
  assertStringIncludes(script, 'START NEW CARAVAN');
  assertStringIncludes(script, 'startup call');
  assertStringIncludes(script, 'RESUME EXISTING CARAVAN');
  assertStringIncludes(script, 'startup continue');
  assertStringIncludes(script, 'LIST ALL CARAVANS');
  assertStringIncludes(script, 'startup survey');
});
