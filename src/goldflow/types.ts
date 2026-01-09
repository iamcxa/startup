// src/goldflow/types.ts
/**
 * Goldflow - Execution Engine Types
 *
 * Goldflow is the execution layer that handles HOW work gets done reliably.
 * It has no narrative/role concepts - those belong to Paydirt layer.
 */

export type ComponentType = 'source' | 'stage' | 'processor' | 'verifier' | 'sink' | 'controller';

export interface GoldflowComponent {
  type: ComponentType;
  name: string;
  config: Record<string, unknown>;
}

export interface Source extends GoldflowComponent {
  type: 'source';
  fetch: () => Promise<unknown>;
}

export interface Stage extends GoldflowComponent {
  type: 'stage';
  process: (input: unknown) => Promise<unknown>;
}

export interface Processor extends GoldflowComponent {
  type: 'processor';
  superpowers: string[];
  retryPolicy?: number;
  timeout?: number;
  process: (input: unknown) => Promise<unknown>;
}

export interface Verifier extends GoldflowComponent {
  type: 'verifier';
  superpowers?: string[];
  gates: string[];
  verify: (input: unknown) => Promise<boolean>;
}

export interface Sink extends GoldflowComponent {
  type: 'sink';
  output: (data: unknown) => Promise<void>;
}

export interface Controller extends GoldflowComponent {
  type: 'controller';
  superpowers?: string[];
  maxParallel?: number;
  orchestrate: (components: GoldflowComponent[]) => Promise<void>;
}

export interface Pipeline {
  name: string;
  trigger: string;
  stages: PipelineStage[];
}

export interface PipelineStage {
  name: string;
  processor?: string;
  verifier?: string;
  superpowers?: string[];
  onFail?: 'return_to_miner' | 'abort' | 'continue';
  requires?: Record<string, string>;
}

export interface GoldflowConfig {
  processors: Record<string, Partial<Processor>>;
  verifiers: Record<string, Partial<Verifier>>;
  controllers: Record<string, Partial<Controller>>;
  pipelines: Record<string, Pipeline>;
}
