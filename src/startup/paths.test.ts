// src/startup/paths.test.ts
import { assertEquals, assertMatch } from '@std/assert';
import {
  getStartupBinPath,
  getStartupInstallDir,
  getProspectPath,
  getProspectsDir,
  getUserProjectDir,
} from './paths.ts';

Deno.test('getStartupInstallDir returns startup root directory', () => {
  const installDir = getStartupInstallDir();
  // Should be a valid path (project dir name may vary)
  assertMatch(installDir, /\/[^/]+$/);
});

Deno.test('getUserProjectDir returns current working directory', () => {
  const projectDir = getUserProjectDir();
  assertEquals(projectDir, Deno.cwd());
});

Deno.test('getStartupBinPath returns path to startup.ts', () => {
  const binPath = getStartupBinPath();
  assertMatch(binPath, /startup\.ts$/);
});

Deno.test('getProspectsDir returns prospects directory path', () => {
  const prospectsDir = getProspectsDir();
  assertMatch(prospectsDir, /prospects$/);
});

Deno.test('getProspectPath returns path to specific prospect file', () => {
  const trailBossPath = getProspectPath('trail-boss');
  assertMatch(trailBossPath, /prospects\/trail-boss\.md$/);
});
