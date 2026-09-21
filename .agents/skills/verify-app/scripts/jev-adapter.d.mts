export declare const JEV_QUESTION_VERSION: string;
export declare const JEV_MODES: Set<string>;
export declare function runJevTriage(evidence: Record<string, unknown>, options?: {
  mode?: string;
  model?: string;
  runtimeDir?: string;
  persistPath?: string;
  timeoutSeconds?: number;
}): Promise<{
  decision: Record<string, unknown>;
  evidence: Record<string, unknown>;
  raw: Record<string, unknown> | null;
  serviceAvailable: boolean;
}>;
