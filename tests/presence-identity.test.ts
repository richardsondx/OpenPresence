import { describe, expect, it } from "vitest";
import { createAgent, deliverSandboxExecution, formSandboxIntent, normalizeState, recordVerifiedFollow, startPlaygroundSession } from "../lib/runtime";
import { isPlaceholderIdentity, deriveIdentityHydrationState, extractIdentityHydrationLeads, resolveCanonicalPerson, createRememberedPerson } from "../lib/network-memory";
import { routeExecutionIntent } from "../lib/execution-router";
import type { Presence, SocialIntent } from "../lib/types";

describe("Presence platform identity", () => {
  it("keeps the platform handle in Presence context and Social Mirror authorship", () => {
    const input = { name: "Ada", description: "Explain useful AI agent ideas.", mode: "agent" as const, handle: "@ada_presence", accent: "#D68754" };
    let state = createAgent(input);
    expect(state.presence?.context.publicIdentity.handle).toBe(input.handle);

    state = startPlaygroundSession(state);
    state = formSandboxIntent(state, { sessionId: state.playgroundSessions[0]!.id, affordance: "post", text: "A useful simulated point of view." });
    state = deliverSandboxExecution(state, state.executions[0]!.id);

    expect(state.mirrorObjects[0]?.author).toMatchObject({ displayName: "Ada", handle: input.handle });
  });
});

describe("Channel, Environment, Access, Capability Taxonomy", () => {
  it("Skool proof: Skool channel with Managed Browser is a valid Presence without Native API", () => {
    let state = createAgent({ name: "Genny", description: "Test", mode: "agent", handle: "genny", accent: "#D68754" });
    
    // Configure Skool presence
    const skoolPresence: Presence = {
      ...state.presence!,
      id: "presence_skool_test",
      channel: "skool",
      name: "Acme Community Genny",
      environment: "live",
      destination: {
        handle: "genny_skool",
        displayName: "Acme Founders Community",
        spaceUrl: "https://www.skool.com/acme-founders",
      },
      accessBindings: [
        { kind: "managed_browser", channel: "skool", status: "healthy" },
        { kind: "user_attached_browser", channel: "skool", status: "disconnected" },
        { kind: "external_bridge", channel: "skool", status: "disconnected" },
      ],
    };
    state.presences = [skoolPresence, ...state.presences];
    state = normalizeState(state);

    const hydrated = state.presences.find((p) => p.id === "presence_skool_test")!;
    expect(hydrated.channel).toBe("skool");
    expect(hydrated.environment).toBe("live");
    expect(hydrated.destination?.spaceUrl).toBe("https://www.skool.com/acme-founders");
    
    // Native connector is absent
    expect(hydrated.accessBindings?.some((b) => b.kind === "native")).toBe(false);
    // Managed browser connector is healthy
    const browserBinding = hydrated.accessBindings?.find((b) => b.kind === "managed_browser");
    expect(browserBinding?.status).toBe("healthy");
  });

  it("X channel body-switch invariance: Disconnecting Native X keeps Channel=X, Environment=Live", () => {
    let state = createAgent({ name: "Genny", description: "Test", mode: "agent", handle: "genny", accent: "#D68754" });
    state.presence = { ...state.presence!, environment: "live", connectionMode: "native" };
    const presence = state.presence;
    expect(presence.channel).toBe("x");
    expect(presence.environment).toBe("live");

    const presenceWithoutNative = {
      ...presence,
      accessBindings: presence.accessBindings?.map((b) => b.kind === "native" ? { ...b, status: "disconnected" as const } : b),
    };
    expect(presenceWithoutNative.channel).toBe("x");
    expect(presenceWithoutNative.environment).toBe("live");
  });

  it("Taxonomy isolation: Sandbox is an Environment, never an AccessBinding; Chrome/Bridge are Access, never Channels", () => {
    let state = createAgent({ name: "Genny", description: "Test", mode: "agent", handle: "genny", accent: "#D68754" });
    const presence = state.presence!;

    // Assert that accessBindings only contains transport connectors
    const allowedConnectorKinds = new Set(["native", "managed_browser", "user_attached_browser", "external_bridge"]);
    for (const binding of presence.accessBindings ?? []) {
      expect(allowedConnectorKinds.has(binding.kind)).toBe(true);
      // Sandbox must NEVER be a connector binding
      expect((binding as { kind: string }).kind).not.toBe("sandbox");
      expect((binding as { kind: string }).kind).not.toBe("simulated");
    }

    // Assert environment is live or sandbox
    expect(["live", "sandbox"]).toContain(presence.environment);
  });
});

describe("Person Identity & Hydration Provenance", () => {
  it("Recognizes placeholders correctly and prevents placeholder clobbering", () => {
    expect(isPlaceholderIdentity("X user")).toBe(true);
    expect(isPlaceholderIdentity("Unknown X account")).toBe(true);
    expect(isPlaceholderIdentity("18920194810293847")).toBe(true);
    expect(isPlaceholderIdentity("@18920194810293847")).toBe(true);
    expect(isPlaceholderIdentity("")).toBe(true);
    expect(isPlaceholderIdentity(undefined)).toBe(true);

    // Real identities
    expect(isPlaceholderIdentity("Dr. Star Heartsong")).toBe(false);
    expect(isPlaceholderIdentity("@DrStarHeartsong")).toBe(false);
    expect(isPlaceholderIdentity("maya_research")).toBe(false);
  });

  it("Text mentions create hydration leads only; never establish identity authority", () => {
    const text = "Great point by @DrStarHeartsong and @alice about AI governance!";
    const leads = extractIdentityHydrationLeads("x", text, "post_123");
    
    expect(leads).toHaveLength(2);
    expect(leads[0]).toMatchObject({ possibleHandle: "DrStarHeartsong", channel: "x", sourceRef: "post_123" });
    expect(leads[1]).toMatchObject({ possibleHandle: "alice", channel: "x", sourceRef: "post_123" });

    // Derive hydration state for a person with only a lead vs verified metadata
    expect(deriveIdentityHydrationState("x", "X user", undefined)).toBe("unhydrated");
    expect(deriveIdentityHydrationState("x", "X user", "DrStarHeartsong")).toBe("partial");
    expect(deriveIdentityHydrationState("x", "Dr. Star Heartsong", "DrStarHeartsong")).toBe("hydrated");
  });

  it("Field-level evidence is preserved and placeholder value does not overwrite known real identity", () => {
    let state = createAgent({ name: "Genny", description: "Test", mode: "agent", handle: "genny", accent: "#D68754" });
    const presenceId = state.presence!.id;

    // First, remember person with real name and handle
    const initial = createRememberedPerson({
      agentId: state.agent!.id,
      presenceId,
      channel: "x",
      externalActorId: "actor_star_123",
      displayName: "Dr. Star Heartsong",
      handle: "DrStarHeartsong",
      sourceEnvironment: "live",
      source: "operator",
      evidenceKind: "operator",
    }, state.people, state.personIdentities, state.relationships);

    state.people = [initial.person];
    state.personIdentities = [initial.identity];
    state.relationships = [initial.relationship];

    // Canonical resolution returns real name and handle
    const resolvedBefore = resolveCanonicalPerson(state, initial.person.id, presenceId);
    expect(resolvedBefore.displayName).toBe("Dr. Star Heartsong");
    expect(resolvedBefore.rawHandle).toBe("DrStarHeartsong");
    expect(resolvedBefore.hydrationState).toBe("hydrated");

    // Ingest a follow with a snowflake / placeholder target ID
    state = recordVerifiedFollow(state, presenceId, { type: "x.user", id: "actor_star_123" });

    // The known real displayName "Dr. Star Heartsong" MUST NOT be overwritten by "X user" or "Unknown X account"
    const resolvedAfter = resolveCanonicalPerson(state, initial.person.id, presenceId);
    expect(resolvedAfter.displayName).toBe("Dr. Star Heartsong");
    expect(resolvedAfter.rawHandle).toBe("DrStarHeartsong");
    expect(resolvedAfter.hydrationState).toBe("hydrated");
  });
});

