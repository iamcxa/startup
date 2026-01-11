// src/types.ts
// Core types for Paydirt

export type ProspectRole =
  | 'camp-boss'
  | 'trail-boss'
  | 'surveyor'
  | 'shift-boss'
  | 'miner'
  | 'assayer'
  | 'canary'
  | 'smelter'
  | 'claim-agent'
  | 'scout'
  | 'pm';  // Decision proxy agent

export type CaravanMode = 'manual' | 'prime';

export type CaravanStatus =
  | 'open'
  | 'in_progress'
  | 'ready-for-review'
  | 'reviewing'
  | 'pr-created'
  | 'ci-pending'
  | 'delivered'
  | 'closed';

export type QuestionType = 'decision' | 'clarification' | 'approval';
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none' | 'human';

export interface Caravan {
  id: string;
  name: string;
  task: string;
  status: CaravanStatus;
  mode: CaravanMode;
  tunnelPath?: string; // Path to context file for prime mode
  tmuxSession: string;
  maxWorkers: number;
}

export interface ProspectState {
  role: ProspectRole;
  instance: number;
  pane: string;
  status: 'idle' | 'active' | 'checkpoint' | 'pending-respawn' | 'completed' | 'blocked';
  contextUsage?: number;
}

export interface PaydirtConfig {
  maxWorkers: number;
  prospectsDir?: string;
  caravan: {
    bdDir: string;
    archiveDir: string;
  };
  roles: Record<string, { preferredSkills?: string[] }>;
  respawn: {
    contextThreshold: number;
  };
}

export const DEFAULT_CONFIG: PaydirtConfig = {
  maxWorkers: 3,
  caravan: {
    bdDir: './',
    archiveDir: 'docs/tasks/archive',
  },
  roles: {},
  respawn: {
    contextThreshold: 80,
  },
};
