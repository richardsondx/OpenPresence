import { describe, expect, it } from "vitest";
import { networkSearchInstruction, searchSandboxNetwork } from "../lib/network";
import type { SandboxActor } from "../lib/types";
import { addSandboxEvent, applyOperation, approveSandboxIntroduction, createAgent, recordSandboxNetworkSearch, startPlaygroundSession } from "../lib/runtime";
import { writeState } from "../lib/db";
import { POST as statePost } from "../app/api/state/route";

const actors: SandboxActor[] = [
  {
    id: "actor-vet",
    sessionId: "session-1",
    displayName: "Avery Cole",
    handle: "@averysec",
    role: "community",
    profile: {
      bio: "Former military veteran now doing security engineering",
      location: "Detroit, Michigan",
      roles: ["security engineer"],
      skills: ["security", "incident response"],
      introductionPermission: "ask-first",
    },
    createdAt: "2026-08-13T12:00:00.000Z",
  },
  {
    id: "actor-unrelated",
    sessionId: "session-1",
    displayName: "Maya Chen",
    role: "audience",
    profile: { bio: "Product researcher", location: "Toronto, Ontario", introductionPermission: "not-available" },
    createdAt: "2026-08-13T12:00:00.000Z",
  },
];

describe("sandbox network search", () => {
  it("returns evidence-bearing candidates and preserves introduction consent", () => {
    const result = searchSandboxNetwork(actors, "session-1", "Former military veterans near Detroit who do security");
    expect(result.status).toBe("matches");
    expect(result.candidates[0]).toMatchObject({ actorId: "actor-vet", displayName: "Avery Cole", permission: "ask-first" });
    expect(result.candidates[0]?.evidence.join(" ")).toContain("Detroit, Michigan");
    expect(networkSearchInstruction(result)).toContain("ask before introducing");
    expect(networkSearchInstruction(result)).toContain("security engineer");
  });

  it("does not turn an unverified request into a fabricated match", () => {
    const result = searchSandboxNetwork(actors, "session-1", "Former astronaut near Mars");
    expect(result.status).toBe("no-match");
    expect(result.candidates).toHaveLength(0);
    expect(networkSearchInstruction(result)).toContain("Do not imply that a person was found");
  });

  it("keeps one sandbox directory isolated from another", () => {
    const result = searchSandboxNetwork(actors, "other-session", "Detroit security");
    expect(result.status).toBe("no-match");
  });

  it("persists profile evidence when a simulated actor is seeded", () => {
    let state = createAgent({ name: "Jenny", description: "Connect thoughtful builders.", mode: "agent", handle: "@jenny_ai", accent: "#D68754" });
    state = startPlaygroundSession(state);
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, {
      sessionId: session.id,
      actionId: "post",
      actorName: "Avery Cole",
      profile: actors[0]!.profile,
      content: "I work in security engineering in Detroit.",
    });
    expect(state.sandboxActors[0]?.profile).toEqual(actors[0]?.profile);
  });

  it("turns a verified candidate into a consent-aware, auditable introduction", () => {
    let state = createAgent({ name: "Jenny", description: "Connect thoughtful builders.", mode: "agent", handle: "@jenny_ai", accent: "#D68754" });
    state = applyOperation(state, { type: "setPresence", patch: { execution: { message: "auto" } } });
    state = startPlaygroundSession(state);
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Avery Cole", actorHandle: "@averysec", profile: actors[0]!.profile, content: "I work in security engineering in Detroit." });
    const result = searchSandboxNetwork(state.sandboxActors, session.id, "Former military veterans near Detroit who do security");
    state = recordSandboxNetworkSearch(state, { sessionId: session.id, presenceId: session.presenceId, result });
    const introduction = state.networkIntroductions[0]!;
    expect(introduction.status).toBe("awaiting-consent");

    state = approveSandboxIntroduction(state, introduction.id);
    expect(state.networkIntroductions[0]?.status).toBe("succeeded");
    expect(state.networkIntroductions[0]?.executionId).toBeDefined();
    expect(state.outcomes[0]?.status).toBe("succeeded");
    expect(state.mirrorObjects[0]?.externalRef.type).toBe("x.message");
    expect(state.mirrorObjects[0]?.parentExternalRef).toEqual({ type: "sandbox.actor", id: state.sandboxActors[0]?.id });
  });

  it("exposes approval through the state API without bypassing the execution envelope", async () => {
    let state = createAgent({ name: "Jenny", description: "Connect thoughtful builders.", mode: "agent", handle: "@jenny_ai", accent: "#D68754" });
    state = applyOperation(state, { type: "setPresence", patch: { execution: { message: "auto" } } });
    state = startPlaygroundSession(state);
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Avery Cole", profile: actors[0]!.profile, content: "Security engineering in Detroit." });
    state = recordSandboxNetworkSearch(state, { sessionId: session.id, presenceId: session.presenceId, result: searchSandboxNetwork(state.sandboxActors, session.id, "Detroit security engineer") });
    writeState(state);
    const response = await statePost(new Request("http://localhost/api/state", { method: "POST", body: JSON.stringify({ type: "approveSandboxIntroduction", id: state.networkIntroductions[0]!.id }), headers: { "content-type": "application/json" } }));
    const next = await response.json();
    expect(response.status).toBe(200);
    expect(next.networkIntroductions[0].status).toBe("succeeded");
    expect(next.executions[0].connector).toBe("simulated");
  });
});
