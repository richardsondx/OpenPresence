import type { ChannelAffordance, ChannelId, ExecutionMode, OpenPresenceState, Presence } from "./types";
import { bridgeExecutionStatus } from "./bridge-contract";
import { xCreditsExhausted, xNativeWriteUnavailable } from "./x-credits";

export type ExecutionAuthorityMode = ExecutionMode; // "auto" | "review" | "manual" | "off"

export type ExecutionOperationalDisposition =
  | "ready"
  | "awaiting_review"
  | "waiting"
  | "recovering"
  | "blocked"
  | "needs_you";

export interface ExecutionReadiness {
  affordance: string;
  normalizedAffordance: string;
  authority: ExecutionAuthorityMode;
  executableNow: boolean;
  availableRoutes: ("native" | "bridge" | "simulated")[];
  disposition: ExecutionOperationalDisposition;
  blockerReason?: string;
  requiredAction?: "operator_auth" | "policy_change" | "connector_reconnect" | "billing";
}

export function normalizeAffordanceKey(affordance: string): string {
  return affordance.trim().toLowerCase().replace(/^[a-z0-9_-]+\./, "");
}

export function nativeConnectionCanAct(connection: OpenPresenceState["nativeConnections"][number], expectedHandle?: string): boolean {
  const identityMatches = !expectedHandle || Boolean(connection.account?.username && connection.account.username.replace(/^@/, "").trim().toLowerCase() === expectedHandle.replace(/^@/, "").trim().toLowerCase());
  return identityMatches && (connection.status === "connected"
    || (connection.status === "needs-attention" && Boolean(connection.healthMessage || connection.deliveryError)));
}

export function nativeConnectionCanWrite(connection: OpenPresenceState["nativeConnections"][number], expectedHandle?: string): boolean {
  if (!nativeConnectionCanAct(connection, expectedHandle)) return false;
  return !xNativeWriteUnavailable(connection);
}

/**
 * Central authority, capability, and body-route evaluator.
 * Determines whether a specific intended social act is authorized and executable right now.
 */
export function evaluateExecutionReadiness(input: {
  presence: Presence;
  channel?: ChannelId;
  affordance: ChannelAffordance | string;
  state: OpenPresenceState;
  environment?: "sandbox" | "live";
}): ExecutionReadiness {
  const { presence, state } = input;
  const channel = input.channel ?? presence.channel ?? "x";
  const normalizedAffordance = normalizeAffordanceKey(input.affordance);
  const environment = input.environment ?? (presence.environment === "sandbox" ? "sandbox" : "live");

  // 1. Presence lifecycle status
  if (presence.status === "paused") {
    return {
      affordance: input.affordance,
      normalizedAffordance,
      authority: "off",
      executableNow: false,
      availableRoutes: [],
      disposition: "waiting",
      blockerReason: `${presence.name} is paused. Wake the Presence to resume activity.`,
    };
  }
  if (presence.status === "disconnected") {
    return {
      affordance: input.affordance,
      normalizedAffordance,
      authority: "off",
      executableNow: false,
      availableRoutes: [],
      disposition: "needs_you",
      blockerReason: `${presence.name} is disconnected from its channel.`,
      requiredAction: "connector_reconnect",
    };
  }

  // 2. Execution envelope authority for this specific affordance
  const authority: ExecutionAuthorityMode =
    presence.execution?.[normalizedAffordance] ??
    presence.executionEnvelope?.affordances?.[normalizedAffordance]?.mode ??
    presence.executionEnvelope?.affordances?.[input.affordance]?.mode ??
    "off";

  if (authority === "off") {
    const formattedAffordance = normalizedAffordance.replace(/_/g, " ");
    return {
      affordance: input.affordance,
      normalizedAffordance,
      authority: "off",
      executableNow: false,
      availableRoutes: [],
      disposition: "blocked",
      blockerReason: `${formattedAffordance.charAt(0).toUpperCase() + formattedAffordance.slice(1)} actions are disabled in ${presence.name}'s Execution Settings.`,
      requiredAction: "policy_change",
    };
  }

  // 3. Body Routes & Connector Availability
  const availableRoutes: ("native" | "bridge" | "simulated")[] = [];

  if (environment === "sandbox") {
    availableRoutes.push("simulated");
    return {
      affordance: input.affordance,
      normalizedAffordance,
      authority,
      executableNow: true,
      availableRoutes,
      disposition: authority === "review" ? "awaiting_review" : "ready",
    };
  }

  // Live environment body routes
  if (channel === "x") {
    const nativeConn = state.nativeConnections?.find(
      (item) => item.presenceId === presence.id && item.kind === "x" && item.access === "read-write" && nativeConnectionCanWrite(item, presence.handle)
    );
    if (nativeConn && nativeConn.status === "connected") {
      availableRoutes.push("native");
    }

    const bridge = state.bridges?.find(
      (item) =>
        item.presenceId === presence.id &&
        item.state !== "offline" &&
        bridgeExecutionStatus(item) === "connected" &&
        (item.capabilities.affordances.includes(normalizedAffordance) || item.capabilities.affordances.includes(input.affordance))
    );
    if (bridge) {
      availableRoutes.push("bridge");
    }
  } else {
    const genericBridge = state.bridges?.find(
      (item) => item.presenceId === presence.id && item.state !== "offline" && bridgeExecutionStatus(item) === "connected"
    );
    if (genericBridge) {
      availableRoutes.push("bridge");
    }
  }

  if (availableRoutes.length === 0) {
    const billingBlocked = state.nativeConnections?.find((item) => item.presenceId === presence.id && item.kind === "x" && xCreditsExhausted(item));
    if (billingBlocked) {
      return {
        affordance: input.affordance,
        normalizedAffordance,
        authority,
        executableNow: false,
        availableRoutes: [],
        disposition: "needs_you",
        blockerReason: "X API billing is blocking this action. Restore API credits or the spending allowance, or connect an authorized browser route.",
        requiredAction: "billing",
      };
    }
    // Check if connector needs operator auth vs temporary connection loss
    const brokenConn = state.nativeConnections?.find((item) => item.presenceId === presence.id && item.status === "needs-attention");
    if (brokenConn) {
      return {
        affordance: input.affordance,
        normalizedAffordance,
        authority,
        executableNow: false,
        availableRoutes: [],
        disposition: "needs_you",
        blockerReason: `The connector for ${presence.name} requires operator authentication or token refresh.`,
        requiredAction: "operator_auth",
      };
    }

    return {
      affordance: input.affordance,
      normalizedAffordance,
      authority,
      executableNow: false,
      availableRoutes: [],
      disposition: "recovering",
      blockerReason: `No active delivery route (Native connection or Browser Bridge) is currently connected for ${presence.name}.`,
      requiredAction: "connector_reconnect",
    };
  }

  return {
    affordance: input.affordance,
    normalizedAffordance,
    authority,
    executableNow: true,
    availableRoutes,
    disposition: authority === "review" ? "awaiting_review" : "ready",
  };
}
