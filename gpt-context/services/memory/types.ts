export type Iso = string;

export interface MemoryEvent {
  id: string;
  kind: 'draft' | 'critique' | 'decision' | 'patch' | 'note';
  text?: string;
  data?: any;
  tags?: string[];
  ts: Iso;
}

export interface MemoryRecord {
  id: string;
  phase: 'draft' | 'critique' | 'merge' | 'decision';
  goal?: string;
  inputs?: any;
  output?: any;
  tokens?: { prompt?: number; completion?: number };
  ts: Iso;
}

export interface Digest {
  day: string; // YYYY-MM-DD
  summaryMd: string;
  items: Array<{ id: string; kind: string; title?: string }>;
  ts: Iso;
}

export interface KnowledgeCard {
  id: string; // slug
  title: string;
  tags: string[];
  bodyMd: string;
  ts: Iso;
}

export interface RegressionNote {
  id: string; // YYYY-MM-DD-<slug>
  tags: string[];
  bodyMd: string;
  ts: Iso;
}

export interface ActiveTask {
  taskId: string;
  goal: string;
  openQuestions: string[];
  pendingRisks: string[];
  nextSteps: string[];
  updated: Iso;
}

export interface HydratedContext {
  active?: ActiveTask;
  cards: KnowledgeCard[];
  regressions: RegressionNote[];
  decisions: MemoryRecord[]; // phase=decision 최근 것 일부
}

export interface ManifestEntry {
  id: string; // drive fileId
  hash: string; // sha256
}

export interface Manifest {
  version: number;
  updated: Iso;
  files: Record<string, ManifestEntry>;
}
