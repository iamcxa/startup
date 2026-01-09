// src/paydirt/boomtown/mod.ts

/**
 * Boomtown Dashboard Module
 *
 * Provides the mprocs-based TUI dashboard for Paydirt.
 * Gold Rush / Western Frontier aesthetic.
 */

// Dashboard launcher and hot-reload
export {
  launchBoomtown,
  requestDashboardReload,
  mapCaravanStatus,
  mapCaravansToDashboard,
  findPaydirtPath,
  RELOAD_TRIGGER_FILE,
  type CaravanInfo,
} from './dashboard.ts';

// mprocs configuration
export {
  generateMprocsConfig,
  writeMprocsConfig,
  generateStatusScriptContent,
  generateCaravanScriptContent,
  generateWelcomeScript,
  type DashboardCaravanInfo,
  type CaravanStatus,
} from './mprocs.ts';

// Camp Boss pane
export { generateCampBossScriptContent } from './camp-boss-pane.ts';
