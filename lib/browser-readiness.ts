import type { Bridge, BrowserAdapterObservation } from "./types";

export const BROWSER_ADAPTER_PROBE_MAX_AGE_MS = 2 * 60_000;
export type BrowserCapabilityRequirement = "channelRead" | "mediaUpload" | "verification" | { affordance: string; media?: boolean };
export function isShippedChromeBridge(bridge: Partial<Bridge>) {
  return bridge.kind === "bridge" && (bridge.name?.startsWith("OpenPresence Chrome") || bridge.browserAdapters?.some(adapter => adapter.executorId.startsWith("openpresence-chrome-"))) === true;
}
export function browserProbeIsFresh(adapter: BrowserAdapterObservation, now = Date.now()) {
  const observed = Date.parse(adapter.observedAt);
  return Boolean(adapter.executorId) && adapter.probed === true && adapter.protocolVersion === 2 && Boolean(adapter.version.trim()) && Number.isFinite(observed) && observed <= now && now - observed <= BROWSER_ADAPTER_PROBE_MAX_AGE_MS;
}
export function browserAdapterForCapability(bridge: Partial<Bridge>, expectedHandle: string, requirement: BrowserCapabilityRequirement = "channelRead", now = Date.now()) {
  const normalize = (value?: string) => (value ?? "").replace(/^@/, "").trim().toLowerCase();
  return bridge.browserAdapters?.find(adapter => {
    const identity = adapter.accountIdentity;
    const identityAt = Date.parse(identity?.observedAt ?? "");
    if (!browserProbeIsFresh(adapter, now) || identity?.status !== "verified" || !normalize(expectedHandle) || normalize(identity.username) !== normalize(expectedHandle) || !Number.isFinite(identityAt) || identityAt > now || now - identityAt > 30 * 60_000) return false;
    if (typeof requirement === "string") return adapter.capabilities[requirement] === true;
    const action = requirement.affordance.replace(/^x\./, "");
    return adapter.capabilities.verification && (!requirement.media || adapter.capabilities.mediaUpload) && adapter.capabilities.affordances.some(item => item === action || item === requirement.affordance);
  });
}
