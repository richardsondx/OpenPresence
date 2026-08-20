import { getBrowserBody, getDependencyHealth, readStateForContext } from "./db";
import { derivePresenceCapabilityManifest } from "./runtime";
import type { Presence, SocialIntent } from "./types";

export type ExecutionRoute = "native_x" | "managed_browser" | "user_attached_bridge" | "blocked";

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
 * 1. Native-First: If Native X is healthy and authorized for the action, Native X is chosen.
 * 2. Capability Fallback: Managed Browser is only used when Native X cannot support the action.
 * 3. 429 Invariant: If Native X is rate-limited (429), the router returns 'blocked' with a waitResetAt;
 *    it NEVER falls back to browser to evade rate limits.
 */
export function routeExecutionIntent(input: {
  intent: SocialIntent;
  presence: Presence;
  now?: Date;
}): RouteDecision {
  const { intent, presence } = input;
  const now = input.now ?? new Date();
  const affordance = intent.affordance; // "post" | "reply" | "like" | "repost" | "quote" | "follow"
  const presenceId = presence.id;

  // 1. Check Native X Health and Rate Limits
  const nativeHealth = getDependencyHealth("native_x", presenceId);
  const nativeIsRateLimited = ["waiting", "circuit_open"].includes(nativeHealth?.state ?? "") && nativeHealth?.circuitUntil && new Date(nativeHealth.circuitUntil) > now;

  if (nativeIsRateLimited) {
    return {
      route: "blocked",
      reason: `Native X is rate-limited until ${nativeHealth.circuitUntil}. Hard invariant: rate limits are waited out, never evaded via browser.`,
      waitResetAt: nativeHealth.circuitUntil,
      requiresBrowser: false,
    };
  }

  // 2. Check capability manifest for Native support
  const state = readStateForContext({ presenceId });
  const manifest = derivePresenceCapabilityManifest(state, presenceId);
  const normalizedAffordance = affordance.replace(/^(x|linkedin|substack)\./, "");
  const capability = manifest.items.find((item) => item.capability === affordance || item.capability === normalizedAffordance);

  const nativeSupportsAction = capability?.provider === "Native X" && capability.canExecute;
  const nativeHealthy = !nativeHealth || nativeHealth.state === "healthy";

  if (nativeSupportsAction && nativeHealthy) {
    return {
      route: "native_x",
      reason: "Native X is healthy, authorized, and supports this action (Native-first invariant).",
      requiresBrowser: false,
    };
  }

  // A native-capable action must not change transport merely because Native X
  // is unhealthy. Switching to a browser here would evade the provider's
  // authority and can duplicate or amplify a write.
  if (nativeSupportsAction && !nativeHealthy) {
    return {
      route: "blocked",
      reason: "Native X supports this action but is not healthy. Wait for native recovery instead of switching bodies.",
      waitResetAt: nativeHealth?.circuitUntil,
      requiresBrowser: false,
    };
  }

  // 3. Fall back to Managed Browser if Native cannot perform this action
  const browserBody = getBrowserBody(presenceId);
  const browserHealth = getDependencyHealth("managed_browser", presenceId);
  const browserHealthy = (!browserHealth || browserHealth.state === "healthy") && browserBody?.state === "healthy";

  if (!nativeSupportsAction && browserBody && browserBody.mode === "managed" && browserHealthy) {
    return {
      route: "managed_browser",
      reason: nativeSupportsAction
        ? "Native X is degraded/recovering; falling back to Managed Browser."
        : "Action requires browser capabilities not supported by Native X API.",
      requiresBrowser: true,
    };
  }

  // 4. Fall back to user-attached bridge if configured
  const bridgeHealth = getDependencyHealth("user_attached_bridge", presenceId);
  const bridgeHealthy = !bridgeHealth || bridgeHealth.state === "healthy";
  if (capability?.provider === "Browser Bridge" && bridgeHealthy) {
    return {
      route: "user_attached_bridge",
      reason: "Routing to user-attached browser bridge.",
      requiresBrowser: true,
    };
  }

  // 5. Blocked
  return {
    route: "blocked",
    reason: `No healthy, authorized execution route available for action "${affordance}".`,
    requiresBrowser: false,
  };
}
