// src/startup/boomtown/mod.ts

/**
 * Boomtown Dashboard Module
 *
 * Provides the zellij-based TUI dashboard for Startup.
 * Gold Rush / Western Frontier aesthetic.
 * Dynamic caravan tab addition via zellij actions.
 */

// Dashboard launcher and hot-reload
export {
  type CaravanInfo,
  findStartupPath,
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

// Zellij integration
export {
  addCaravanTab,
  attachSession,
  BOOMTOWN_SESSION,
  createSession,
  generateBoomtownLayout,
  removeCaravanTab,
  sessionExists,
} from './zellij.ts';

export { launchZellijBoomtown } from './zellij-dashboard.ts';
