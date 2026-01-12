/**
 * Path utilities for Startup
 *
 * Startup is installed globally but runs in user's project directory.
 * These utilities help resolve paths correctly.
 */

/**
 * Get Startup installation directory.
 * This is where Startup's plugin resources (prospects, commands) live.
 */
export function getStartupInstallDir(): string {
  // import.meta.url is file:///path/to/startup/src/startup/paths.ts
  const url = new URL(import.meta.url);
  const filePath = url.pathname;
  // Go from src/startup/paths.ts to startup root
  const parts = filePath.split('/');
  parts.pop(); // remove paths.ts
  parts.pop(); // remove startup
  parts.pop(); // remove src
  return parts.join('/');
}

// Alias for backward compatibility
export const getPaydirtInstallDir = getStartupInstallDir;

/**
 * Get user's project directory (where startup is executed).
 */
export function getUserProjectDir(): string {
  return Deno.cwd();
}

/**
 * Get path to Startup binary (for spawning agents).
 */
export function getStartupBinPath(): string {
  const installDir = getStartupInstallDir();
  return `${installDir}/startup.ts`;
}

// Alias for backward compatibility
export const getPaydirtBinPath = getStartupBinPath;

/**
 * Get path to prospects directory.
 */
export function getProspectsDir(): string {
  const installDir = getStartupInstallDir();
  return `${installDir}/prospects`;
}

/**
 * Get path to a specific prospect definition file.
 */
export function getProspectPath(role: string): string {
  return `${getProspectsDir()}/${role}.md`;
}
