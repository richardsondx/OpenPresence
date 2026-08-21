import { bridgeAdapterStatus } from "@/lib/bridge-contract";
import type { MirrorObject, OpenPresenceState, Operation, Presence } from "@/lib/types";

export type BridgeDiscoveryCandidate = { id: string; authorName: string; text: string };

export type GrowthDiscoverySource = "native" | "bridge";

export function nextSelfDirectedAttentionAt(input: {
  now?: number;
  intensity: "quiet" | "balanced" | "curious" | "custom";
  verifiedQuoteOrRepostsToday: number;
  quoteOrRepostTarget: number;
  verifiedFollowsToday: number;
  followsTarget: number;
}) {
  const normalDelayHours = input.intensity === "quiet" ? 6 : input.intensity === "curious" ? 1 : 3;
  const targetUnmet = input.verifiedQuoteOrRepostsToday < input.quoteOrRepostTarget || input.verifiedFollowsToday < input.followsTarget;
  // More chances inside the testing envelope, without weakening editorial
  // judgment: no-op remains a valid outcome and never counts as progress.
  const delayMs = targetUnmet ? 20 * 60_000 : normalDelayHours * 60 * 60_000;
  return new Date((input.now ?? Date.now()) + delayMs).toISOString();
}

/** Prefer Native reads only while that reader is healthy; a connected Bridge
 * must take over discovery when the Native connection is in attention state. */
export function selectGrowthDiscoverySource(input: { nativeReadable: boolean; nativeStatus?: string; bridgeConnected: boolean; hasNativeCredentials: boolean }): GrowthDiscoverySource | undefined {
  if (input.nativeReadable && input.hasNativeCredentials && input.nativeStatus === "connected") return "native";
  if (input.bridgeConnected) return "bridge";
  if (input.nativeReadable && input.hasNativeCredentials) return "native";
  return undefined;
}

/**
 * Turn fresh observations from the browser body into bounded discovery leads.
 * This deliberately does not judge or authorize an action; it only prevents a
 * healthy Bridge observation stream from being stranded when Native X search
 * is unavailable.
 */
export function selectBridgeDiscoveryCandidates(
  mirrors: MirrorObject[],
  input: { bridgeId: string; presenceId: string; legacyBridgeIds?: Iterable<string>; judgedIds?: Iterable<string>; now?: number; maxAgeMs?: number; limit?: number; isEligible?: (mirror: MirrorObject) => boolean },
): BridgeDiscoveryCandidate[] {
  const judgedIds = new Set(input.judgedIds ?? []);
  const sourceIds = new Set([input.bridgeId, ...(input.legacyBridgeIds ?? [])]);
  const now = input.now ?? Date.now();
  const maxAgeMs = input.maxAgeMs ?? 6 * 60 * 60_000;
  return mirrors
    .filter((item) => sourceIds.has(item.bridgeId) && item.presenceId === input.presenceId && item.channelId === "x" && item.externalRef.type === "x.post" && item.objectType === "post" && item.visibility === "public" && item.actorPresenceId !== input.presenceId && Boolean(item.content?.text?.trim()) && !judgedIds.has(item.externalRef.id) && (!input.isEligible || input.isEligible(item)))
    .filter((item) => now - new Date(item.observedAt ?? item.occurredAt ?? 0).getTime() <= maxAgeMs)
    .sort((left, right) => new Date(right.observedAt ?? right.occurredAt ?? 0).getTime() - new Date(left.observedAt ?? left.occurredAt ?? 0).getTime())
    .slice(0, input.limit ?? 25)
    .map((item) => ({ id: item.externalRef.id, authorName: item.author?.displayName ?? item.author?.handle ?? "X author", text: item.content?.text ?? "" }));
}

/**
 * Native X remains the preferred reader, but a connected browser capability
 * can participate in the recurring attention loop whenever self-directed
 * Growth is enabled. Custom channels use their configured Bridge as the
 * channel route; browser access never changes the X route.
 */
export function shouldRunAttentionWorker(state: OpenPresenceState, presence: Presence) {
  if (presence.channel !== "x" && presence.connectionMode === "bridge") return true;
  if (!presence.selfDirectedAttention?.enabled) return false;
  const bridge = state.bridges.find((item) => item.presenceId === presence.id && item.state !== "offline" && (presence.channel !== "x" || item.name.startsWith("OpenPresence Chrome")));
  return Boolean(bridge && bridgeAdapterStatus(bridge) === "connected");
}

export function recurringAttentionOperation(state: OpenPresenceState, presence: Presence): Extract<Operation, { type: "runAttentionWorker" }> | Extract<Operation, { type: "runPulse" }> {
  return shouldRunAttentionWorker(state, presence)
    ? { type: "runAttentionWorker" }
    : { type: "runPulse", presenceId: presence.id };
}
