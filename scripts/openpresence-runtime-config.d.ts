export interface RuntimeProfile {
  name: string;
  label: string;
  dbPath: string;
  resolvedDbPath: string;
  port: number;
  agentId?: string;
  presenceId?: string;
  handle?: string;
  description?: string;
}

export interface RuntimeConfig {
  version: 1;
  activeProfile: string;
  profiles: Record<string, RuntimeProfile>;
  path: string;
  exists: boolean;
}

export interface RuntimeSelection {
  config: RuntimeConfig;
  profile: RuntimeProfile;
  profileName: string;
  dbPath: string;
  port: number;
  agentId?: string;
  presenceId?: string;
  handle?: string;
  source: string;
  overridden: boolean;
}

export function readRuntimeConfig(): RuntimeConfig;
export function selectRuntimeProfile(name: string): RuntimeProfile;
export function resolveRuntimeSelection(env?: Record<string, string | undefined>): RuntimeSelection;
export function writeRuntimeConfig(input: { activeProfile: string; profiles: Record<string, RuntimeProfile> }): RuntimeConfig;
export const defaultPort: number;
export const manifestPath: string;
export const projectRoot: string;
