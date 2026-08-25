import { getDependencyHealth, readStateForContext } from "./db";
import { derivePresenceCapabilityManifest } from "./runtime";
import { bridgeExecutionStatus } from "./bridge-contract";
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
 * 1. Native-First: If the channel's native connector is healthy and authorized for the action, it is chosen.
 * 2. Learned Browser Fallback: the browser capability is used only after this exact action has previously failed natively.
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
  const affordance = intent.affordance;
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

  const browserLearned = (presence.browserAccess?.learnedFallbacks ?? []).some((item) => item.action === affordance || item.action === normalizedAffordance);
  const browserBridge = state.bridges.find((bridge) => bridge.presenceId === presenceId && bridge.name.startsWith("OpenPresence Chrome · ") && bridgeExecutionStatus(bridge) === "connected");

  const bridgeHealth = getDependencyHealth("user_attached_bridge", presenceId);
  const bridgeHealthy = !bridgeHealth || bridgeHealth.state === "healthy";
  if (browserLearned && browserBridge && bridgeHealthy) {
    return {
      route: "user_attached_bridge",
      reason: `The native connector previously rejected ${affordance}; using the learned browser capability for this action.`,
      requiresBrowser: true,
    };
  }

  const nativeSupportsAction = capability?.provider?.startsWith("Native ") && capability.canExecute;
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
