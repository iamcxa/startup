// src/paydirt/boomtown/mprocs.test.ts
import { assertStringIncludes } from '@std/assert';
import {
  generateMprocsConfig,
  generateStatusScriptContent,
  generateCaravanScriptContent,
  generateWelcomeScript,
  type DashboardCaravanInfo,
} from './mprocs.ts';

// ========================================================================
// Control Room (Assay Office) Tests
// ========================================================================

Deno.test('generateStatusScriptContent includes Paydirt branding', () => {
  const script = generateStatusScriptContent();
  assertStringIncludes(script, 'PAYDIRT');
  assertStringIncludes(script, 'BOOMTOWN');
});

Deno.test('generateStatusScriptContent includes CARAVAN STATUS panel', () => {
  const script = generateStatusScriptContent();
  assertStringIncludes(script, 'CARAVAN STATUS');
  assertStringIncludes(script, 'Active:');
  assertStringIncludes(script, 'Idle:');
});

Deno.test('generateStatusScriptContent includes MINING CAMP STATUS panel', () => {
  const script = generateStatusScriptContent();
  assertStringIncludes(script, 'MINING CAMP STATUS');
  assertStringIncludes(script, 'TIMESTAMP');
  assertStringIncludes(script, 'RUNTIME');
});

Deno.test('generateStatusScriptContent includes MPROCS CONTROLS panel', () => {
  const script = generateStatusScriptContent();
  assertStringIncludes(script, 'MPROCS CONTROLS');
  assertStringIncludes(script, '[C-a]');
  assertStringIncludes(script, '[j/k]');
});

Deno.test('generateStatusScriptContent uses Gold Rush color theme', () => {
  const script = generateStatusScriptContent();
  // Dark brown background (color 94) and gold foreground (color 220)
  assertStringIncludes(script, '48;5;94');
  assertStringIncludes(script, '38;5;220');
});

Deno.test('generateStatusScriptContent includes animated spinner', () => {
  const script = generateStatusScriptContent();
  assertStringIncludes(script, "SPIN=('◐' '◓' '◑' '◒')");
  assertStringIncludes(script, 'FRAME=');
});

// ========================================================================
// mprocs YAML Configuration Tests
// ========================================================================

Deno.test('generateMprocsConfig includes Control Room (Assay Office)', () => {
  const config = generateMprocsConfig([]);
  assertStringIncludes(config, 'CONTROL ROOM');
  assertStringIncludes(config, 'autorestart: true');
});

Deno.test('generateMprocsConfig includes Camp Boss pane', () => {
  const config = generateMprocsConfig([]);
  assertStringIncludes(config, 'CAMP BOSS');
});

Deno.test('generateMprocsConfig includes global mprocs settings', () => {
  const config = generateMprocsConfig([]);
  assertStringIncludes(config, 'proc_list_width: 24');
  assertStringIncludes(config, 'scrollback: 5000');
  assertStringIncludes(config, 'hide_keymap_window: true');
  assertStringIncludes(config, 'server:');
});

Deno.test('generateMprocsConfig includes Caravan panes with status glyphs', () => {
  const caravans: DashboardCaravanInfo[] = [
    { id: 'pd-001', name: 'Running Caravan', status: 'running' },
    { id: 'pd-002', name: 'Idle Caravan', status: 'idle' },
    { id: 'pd-003', name: 'Stopped Caravan', status: 'stopped' },
  ];
  const config = generateMprocsConfig(caravans);

  // Running = ▶, Idle = ◇, Stopped = ■
  assertStringIncludes(config, '▶ pd-001');
  assertStringIncludes(config, '◇ pd-002');
  assertStringIncludes(config, '■ pd-003');
});

Deno.test('generateMprocsConfig uses tmux attach for Caravan panes', () => {
  const caravans: DashboardCaravanInfo[] = [
    { id: 'pd-test', name: 'Test', status: 'running' },
  ];
  const config = generateMprocsConfig(caravans);
  assertStringIncludes(config, 'tmux attach -t paydirt-pd-test');
});

Deno.test('generateMprocsConfig shows welcome panel when no caravans', () => {
  const config = generateMprocsConfig([]);
  assertStringIncludes(config, 'WELCOME');
});

Deno.test('generateMprocsConfig uses custom script paths when provided', () => {
  const caravans: DashboardCaravanInfo[] = [
    { id: 'pd-001', name: 'Test', status: 'running' },
  ];
  const scripts = new Map([['pd-001', '/tmp/test-script.sh']]);
  const config = generateMprocsConfig(caravans, '/tmp/status.sh', scripts);
  assertStringIncludes(config, '/tmp/status.sh');
  assertStringIncludes(config, '/tmp/test-script.sh');
});

// ========================================================================
// Caravan Pane Script Tests
// ========================================================================

Deno.test('generateCaravanScriptContent includes caravan info', () => {
  const script = generateCaravanScriptContent('pd-001', 'Test Caravan', 'running', '/usr/local/bin/paydirt');
  assertStringIncludes(script, 'pd-001');
  assertStringIncludes(script, 'Test Caravan');
});

Deno.test('generateCaravanScriptContent includes start and attach controls', () => {
  const script = generateCaravanScriptContent('pd-001', 'Test', 'idle', '/bin/paydirt');
  assertStringIncludes(script, '[s]');  // Start
  assertStringIncludes(script, '[a]');  // Attach
});

Deno.test('generateCaravanScriptContent uses correct tmux session name', () => {
  const script = generateCaravanScriptContent('pd-abc123', 'Test', 'running', '/bin/paydirt');
  assertStringIncludes(script, 'paydirt-pd-abc123');
});

Deno.test('generateCaravanScriptContent auto-attaches when session exists', () => {
  const script = generateCaravanScriptContent('pd-001', 'Test', 'running', '/bin/paydirt');
  assertStringIncludes(script, 'tmux has-session');
  assertStringIncludes(script, 'attach_to_session');
});

// ========================================================================
// Welcome Script Tests
// ========================================================================

Deno.test('generateWelcomeScript includes available operations', () => {
  const script = generateWelcomeScript();
  assertStringIncludes(script, 'AVAILABLE OPERATIONS');
  assertStringIncludes(script, 'START NEW');
  assertStringIncludes(script, 'paydirt stake');
});
