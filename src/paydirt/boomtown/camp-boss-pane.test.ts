// src/paydirt/boomtown/camp-boss-pane.test.ts
import { assertStringIncludes } from '@std/assert';
import { generateCampBossScriptContent } from './camp-boss-pane.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Camp Boss Pane Tests
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('generateCampBossScriptContent includes Boomtown branding', () => {
  const script = generateCampBossScriptContent(
    '/usr/local/bin/paydirt',
    '/path/to/camp-boss.md',
    '/home/user/project',
  );
  assertStringIncludes(script, 'PAYDIRT');
  assertStringIncludes(script, 'BOOMTOWN');
});

Deno.test('generateCampBossScriptContent includes Camp Boss title', () => {
  const script = generateCampBossScriptContent(
    '/bin/paydirt',
    '/agents/camp-boss.md',
    '/project',
  );
  assertStringIncludes(script, 'CAMP BOSS');
  assertStringIncludes(script, 'Strategic Control');
});

Deno.test('generateCampBossScriptContent uses correct tmux session name', () => {
  const script = generateCampBossScriptContent(
    '/bin/paydirt',
    '/agents/camp-boss.md',
    '/project',
  );
  assertStringIncludes(script, 'paydirt-camp-boss');
});

Deno.test('generateCampBossScriptContent includes start and attach controls', () => {
  const script = generateCampBossScriptContent(
    '/bin/paydirt',
    '/agents/camp-boss.md',
    '/project',
  );
  assertStringIncludes(script, '[s]'); // Start
  assertStringIncludes(script, '[a]'); // Attach
});

Deno.test('generateCampBossScriptContent includes agent file path', () => {
  const agentPath = '/custom/path/to/camp-boss.md';
  const script = generateCampBossScriptContent(
    '/bin/paydirt',
    agentPath,
    '/project',
  );
  assertStringIncludes(script, agentPath);
});

Deno.test('generateCampBossScriptContent includes project root', () => {
  const projectRoot = '/home/user/my-project';
  const script = generateCampBossScriptContent(
    '/bin/paydirt',
    '/agents/camp-boss.md',
    projectRoot,
  );
  assertStringIncludes(script, projectRoot);
});

Deno.test('generateCampBossScriptContent includes capability list', () => {
  const script = generateCampBossScriptContent(
    '/bin/paydirt',
    '/agents/camp-boss.md',
    '/project',
  );
  assertStringIncludes(script, 'Capabilities');
  assertStringIncludes(script, 'Start new');
  assertStringIncludes(script, 'Monitor');
});

Deno.test('generateCampBossScriptContent uses Gold Rush color theme', () => {
  const script = generateCampBossScriptContent(
    '/bin/paydirt',
    '/agents/camp-boss.md',
    '/project',
  );
  // Dark brown background (94) or gold foreground (220)
  assertStringIncludes(script, '48;5;');
  assertStringIncludes(script, '38;5;');
});

Deno.test('generateCampBossScriptContent includes animated spinner', () => {
  const script = generateCampBossScriptContent(
    '/bin/paydirt',
    '/agents/camp-boss.md',
    '/project',
  );
  assertStringIncludes(script, "SPIN=('◐' '◓' '◑' '◒')");
});

Deno.test('generateCampBossScriptContent auto-attaches when session exists', () => {
  const script = generateCampBossScriptContent(
    '/bin/paydirt',
    '/agents/camp-boss.md',
    '/project',
  );
  assertStringIncludes(script, 'tmux has-session');
  assertStringIncludes(script, 'attach_to_session');
});
