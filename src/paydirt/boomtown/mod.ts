// src/paydirt/boomtown/mod.ts

/**
 * Boomtown Dashboard Module
 *
 * Provides the mprocs-based TUI dashboard for Paydirt.
 * Gold Rush / Western Frontier aesthetic.
 */

// Dashboard launcher and hot-reload
export {
  type CaravanInfo,
  findPaydirtPath,
  launchBoomtown,
  mapCaravanStatus,
  mapCaravansToDashboard,
  RELOAD_TRIGGER_FILE,
  requestDashboardReload,
} from './dashboard.ts';

// mprocs configuration
export {
  type CaravanStatus,
  type DashboardCaravanInfo,
  generateCaravanScriptContent,
  generateMprocsConfig,
  generateStatusScriptContent,
  generateWelcomeScript,
  writeMprocsConfig,
} from './mprocs.ts';

// Camp Boss pane
export { generateCampBossScriptContent } from './camp-boss-pane.ts';
