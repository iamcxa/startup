// src/paydirt/paths.test.ts
import { assertEquals, assertMatch } from '@std/assert';
import {
  getPaydirtBinPath,
  getPaydirtInstallDir,
  getProspectPath,
  getProspectsDir,
  getUserProjectDir,
} from './paths.ts';

Deno.test('getPaydirtInstallDir returns paydirt root directory', () => {
  const installDir = getPaydirtInstallDir();
  // Should end with 'paydirt'
  assertMatch(installDir, /paydirt$/);
});

Deno.test('getUserProjectDir returns current working directory', () => {
  const projectDir = getUserProjectDir();
  assertEquals(projectDir, Deno.cwd());
});

Deno.test('getPaydirtBinPath returns path to paydirt.ts', () => {
  const binPath = getPaydirtBinPath();
  assertMatch(binPath, /paydirt\/paydirt\.ts$/);
});

Deno.test('getProspectsDir returns prospects directory path', () => {
  const prospectsDir = getProspectsDir();
  assertMatch(prospectsDir, /paydirt\/prospects$/);
});

Deno.test('getProspectPath returns path to specific prospect file', () => {
  const trailBossPath = getProspectPath('trail-boss');
  assertMatch(trailBossPath, /paydirt\/prospects\/trail-boss\.md$/);
});
