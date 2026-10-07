import { xNativeWriteUnavailable } from "./x-credits";
import { getDependencyHealth, readStateForContext } from "./db";
import { derivePresenceCapabilityManifest } from "./runtime";
import { bridgeReadyForExpectedAccount } from "./bridge-contract";
import type { Presence, SocialIntent } from "./types";

export type ExecutionRoute = "native_x" | "user_attached_bridge" | "blocked";

export interface RouteDecision {
  route: ExecutionRoute;
  reason: string;
  waitResetAt?: string;
  requiresBrowser: boolean;
}

/**
 * Deterministic Execution Router
 * 
 * Invariants:
 * 1. X API and signed-in browser are peer execution tools. Honor the per-intent
 *    choice when ready; use another available tool unless durable evidence says
 *    the failed API route must not be probed again.
 * 2. A known API billing, credential, or capability failure is durable route evidence, so it is not probed again.
 * 3. 429 Invariant: If Native X is rate-limited (429), the router returns 'blocked' with a waitResetAt;
 *    it NEVER selects the browser to evade rate limits.
 */
export function routeExecutionIntent(input: {
  intent: SocialIntent;
  presence: Presence;
  now?: Date;
}): RouteDecision {
  const { intent, presence } = input;
  const now = input.now ?? new Date();
  const affordance = intent.affordance;
  const presenceId = presence.id;
  const state = readStateForContext({ presenceId });

  // 1. Check Native X Health and Rate Limits
  const nativeHealth = getDependencyHealth("native_x", presenceId);
  const expiredRateLimitAt = nativeHealth?.state === "waiting" && Boolean(nativeHealth.circuitUntil && Date.parse(nativeHealth.circuitUntil) <= now.getTime());
  const nativeConnection = state.nativeConnections.find((connection) => connection.presenceId === presenceId && connection.channelId === "x");
  const nativeFailure = `${nativeConnection?.healthMessage ?? ""} ${nativeConnection?.deliveryError ?? ""} ${nativeConnection?.observation?.error ?? ""}`;
  const nativeIsRateLimited = nativeHealth?.state === "waiting" && nativeHealth?.circuitUntil && new Date(nativeHealth.circuitUntil) > now
    || /rate limit|429|too many requests/i.test(nativeFailure) && !expiredRateLimitAt;

  if (nativeIsRateLimited) {
    return {
      route: "blocked",
      reason: `Native X is rate-limited until ${nativeHealth?.circuitUntil ?? "the provider reset"}. Hard invariant: rate limits are waited out, never evaded via browser.`,
      waitResetAt: nativeHealth?.circuitUntil,
      requiresBrowser: false,
    };
  }

  // 2. Check capability manifest for Native support
  const manifest = derivePresenceCapabilityManifest(state, presenceId);
  const normalizedAffordance = affordance.replace(/^(x|linkedin|substack)\./, "");
  const capability = manifest.items.find((item) => item.capability === affordance || item.capability === normalizedAffordance);

  const nativeWriteUnavailable = state.nativeConnections.some((connection) => connection.presenceId === presenceId && connection.channelId === "x" && xNativeWriteUnavailable(connection));
  const browserLearned = (presence.browserAccess?.learnedFallbacks ?? []).some((item) => item.action === affordance || item.action === normalizedAffordance);
  const browserBridge = presence.browserAccess?.enabled === true && state.bridges.find((bridge) => bridge.presenceId === presenceId && bridge.name.startsWith("OpenPresence Chrome") && bridgeReadyForExpectedAccount(bridge, presence.handle) && bridge.capabilities.affordances.some((action) => action === affordance || action === normalizedAffordance));

  const bridgeHealth = getDependencyHealth("user_attached_bridge", presenceId);
  const bridgeHealthy = !bridgeHealth || bridgeHealth.state === "healthy";
  const expiredRateLimit = expiredRateLimitAt;
  const nativeHealthBlocksApi = Boolean(nativeHealth && nativeHealth.state !== "healthy" && !expiredRateLimit);
  const routeEvidenceRequiresBrowser = nativeWriteUnavailable || browserLearned || nativeHealthBlocksApi;
  const prefersBrowser = intent.routePreference === "browser" || presence.connectionMode === "bridge" || routeEvidenceRequiresBrowser;
  if (prefersBrowser && browserBridge && bridgeHealthy) {
    return {
      route: "user_attached_bridge",
      reason: intent.routePreference === "browser" || presence.connectionMode === "bridge"
        ? `The ${intent.routePreference === "browser" ? "Agent" : "Presence"} selected the signed-in browser tool for ${affordance}.`
        : nativeWriteUnavailable || nativeHealth && nativeHealth.state !== "healthy"
          ? `The X API is unavailable for ${affordance}; the signed-in browser is the usable tool.`
          : `Saved per-action route knowledge selects the signed-in browser for ${affordance}.`,
      requiresBrowser: true,
    };
  }

  if (routeEvidenceRequiresBrowser) {
    return {
      route: "blocked",
      reason: "Saved X API health says not to retry this action through the API, and the signed-in browser tool is not currently ready.",
      waitResetAt: nativeHealth?.circuitUntil,
      requiresBrowser: false,
    };
  }

  const nativeSupportsAction = capability?.provider?.startsWith("Native ") && capability.canExecute;
  const nativeHealthy = !nativeHealth || nativeHealth.state === "healthy" || expiredRateLimit;

  if (nativeSupportsAction && nativeHealthy) {
    return {
      route: "native_x",
      reason: "The X API is healthy, authorized, and supports this action; the runtime selected it as the available route.",
      requiresBrowser: false,
    };
  }

  // If the API is unhealthy and the browser tool is unavailable or unverified,
  // hold the action instead of attempting an untracked or duplicate write.
  if (nativeSupportsAction && !nativeHealthy) {
    return {
      route: "blocked",
      reason: "The X API is unhealthy and the signed-in browser tool is not currently available for this action.",
      waitResetAt: nativeHealth?.circuitUntil,
      requiresBrowser: false,
    };
  }

  // 3. A browser-only action can use the browser capability when configured.
  if (capability?.provider === "Browser Bridge" && browserBridge && bridgeHealthy) {
    return {
      route: "user_attached_bridge",
      reason: "Routing to the browser capability for an action the native connector cannot perform.",
      requiresBrowser: true,
    };
  }

  // 4. Blocked
  return {
    route: "blocked",
    reason: `No healthy, authorized execution route available for action "${affordance}".`,
    requiresBrowser: false,
  };
}
