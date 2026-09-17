import { describe, expect, it } from "vitest";
import {
  resolveAgentInitiatedCommunication,
  resolvePeriodicRecap,
  recordAgentInitiatedUpdate,
  selectProactiveUpdates,
  shouldSendProactiveUpdate,
} from "../lib/operator-initiated-communication";
import { resolveProactiveUpdate } from "../lib/attention-coordinator";
import { createAgent, normalizeState, recordRuntimeEvent } from "../lib/runtime";

describe("importance-thresholded Agent-initiated communication", () => {
  it("writes one unsolicited update to the durable Presence conversation and dedupes retries", () => {
    const source = {
      agent: { id: "agent-1" },
      presence: { id: "presence-1", name: "Genny" },
      presences: [{ id: "presence-1", name: "Genny" }],
      operatorConversations: [],
    } as never;
    const candidate = { id: "evt-1", kind: "problem" as const, title: "A responsibility is blocked", detail: "The channel needs an operator decision." };
    const first = recordAgentInitiatedUpdate(source, "presence-1", candidate);
    expect(first.recorded).toBe(true);
    expect(first.state.operatorConversations?.[0]?.messages).toHaveLength(1);
    expect(first.state.operatorConversations?.[0]?.messages[0]?.agentInitiated).toMatchObject({ kind: "problem", dedupeKey: "evt-1", eventId: "evt-1" });
    const second = recordAgentInitiatedUpdate(first.state, "presence-1", candidate);
    expect(second.recorded).toBe(false);
    expect(second.state.operatorConversations?.[0]?.messages).toHaveLength(1);
  });

  it("is wired to the runtime event boundary for meaningful warnings", () => {
    const source = createAgent({ name: "Genny", description: "Build useful things", audience: "builders", mode: "agent", handle: "genny", accent: "#000000" });
    const presenceId = source.presence!.id;
    const next = recordRuntimeEvent(source, presenceId, "X connection needs attention", "The connected account is unavailable.", "warning");
    expect(next.events[0]?.title).toBe("X connection needs attention");
    expect(next.operatorConversations?.flatMap((conversation) => conversation.messages).some((message) => message.agentInitiated?.kind === "problem")).toBe(true);
  });

  it("collapses persisted partial X coverage spam into one plain-language notice", () => {
    const source = createAgent({ name: "Genny", description: "Build useful things", audience: "builders", mode: "agent", handle: "genny", accent: "#000000" });
    const conversation = source.operatorConversations![0]!;
    const oldNotice = {
      id: "old-notice",
      role: "presence" as const,
      content: "Social Mirror partially updated: Observed 100 public posts; inbound mentions were unavailable. The last known Mirror remains available.",
      timestamp: "2026-09-17T09:20:00.000Z",
    };
    const next = normalizeState({
      ...source,
      operatorConversations: [{ ...conversation, messages: [oldNotice, { ...oldNotice, id: "duplicate-notice" } as never] }],
    });
    const messages = next.operatorConversations![0]!.messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]!.content).toContain("X activity is partly available");
    expect(messages[0]!.content).not.toContain("Social Mirror");
  });

  it("does not interrupt Chat again when a degraded X observation is retried", () => {
    const source = createAgent({ name: "Genny", description: "Build useful things", audience: "builders", mode: "agent", handle: "genny", accent: "#000000" });
    const presenceId = source.presence!.id;
    const first = recordRuntimeEvent(source, presenceId, "X activity partly available", "I can still see your recent public posts, but mentions aren't available right now.", "warning", { communicationDedupeKey: "native-x-observation:partial" });
    const second = recordRuntimeEvent(first, presenceId, "X activity partly available", "I can still see your recent public posts, but mentions aren't available right now.", "warning", { communicationDedupeKey: "native-x-observation:partial" });
    const messages = second.operatorConversations?.flatMap((conversation) => conversation.messages) ?? [];
    expect(messages.filter((message) => message.agentInitiated?.dedupeKey === "native-x-observation:partial")).toHaveLength(1);
  });

  it.each([
    ["breakthrough", { kind: "breakthrough" as const, title: "A real breakthrough", detail: "A repeated conversation pattern finally became clear." }],
    ["problem", { kind: "problem" as const, title: "A responsibility is blocked", detail: "The channel needs an operator decision." }],
    ["opportunity", { kind: "opportunity" as const, title: "A strong opportunity surfaced", detail: "This conversation is worth pursuing." }],
    ["permission change", { kind: "permission_change" as const, title: "Execution permission changed", detail: "Review is now required for replies." }],
    ["strategy change", { kind: "strategy_change" as const, title: "Strategy changed", detail: "The Agent is shifting toward technical conversations." }],
    ["periodic recap", { kind: "periodic_recap" as const, title: "This period mattered", detail: "One relationship opened and a plan changed." }],
  ])("surfaces a meaningful %s", (_label, candidate) => {
    const decision = resolveAgentInitiatedCommunication(candidate);
    expect(decision).toMatchObject({ disposition: "proactive_update", importance: "meaningful", kind: candidate.kind });
    expect(shouldSendProactiveUpdate(candidate)).toBe(true);
  });

  it.each([
    { type: "execution", title: "Action verified", detail: "Genny followed @builder on X." },
    { type: "execution", title: "Reply queued", detail: "The reply is waiting for the authorized connector." },
    { type: "execution", title: "Delivery attempted", detail: "The action entered the delivery route." },
    { title: "The social world was refreshed", detail: "Nothing new required judgment." },
  ])("keeps routine work out of proactive conversation: $title", (candidate) => {
    expect(resolveAgentInitiatedCommunication(candidate)).toMatchObject({ importance: "routine" });
    expect(shouldSendProactiveUpdate(candidate)).toBe(false);
  });

  it("surfaces a material problem even when it came from an action record", () => {
    expect(resolveAgentInitiatedCommunication({ type: "execution", tone: "warning", title: "Reply failed", detail: "The connector is disconnected." })).toMatchObject({
      disposition: "proactive_update",
      kind: "problem",
    });
  });

  it("recognizes an operator-facing connection problem from an existing runtime event", () => {
    expect(resolveAgentInitiatedCommunication({ type: "system", tone: "warning", title: "X connection needs attention", detail: "The Presence cannot observe until access is restored." })).toMatchObject({
      disposition: "proactive_update",
      kind: "problem",
    });
  });

  it("lets an explicit routine classification suppress a misleading meaningful label", () => {
    expect(resolveAgentInitiatedCommunication({ kind: "opportunity", importance: "routine", title: "Opportunity noted", detail: "Saved in Activity for later." })).toMatchObject({
      disposition: "routine_receipt",
      importance: "routine",
    });
  });

  it("uses the same policy through the Attention coordinator seam", () => {
    expect(resolveProactiveUpdate({ title: "Plan reassessed", detail: "A new strategy is now safer.", type: "learning" })).toMatchObject({
      disposition: "proactive_update",
      kind: "strategy_change",
    });
  });

  it("deduplicates converging meaningful records without hiding distinct changes", () => {
    const selected = selectProactiveUpdates([
      { id: "event-1", kind: "opportunity", title: "Opportunity surfaced", detail: "A strong match appeared.", dedupeKey: "opportunity:1" },
      { id: "event-2", kind: "opportunity", title: "Opportunity surfaced again", detail: "The same match was observed.", dedupeKey: "opportunity:1" },
      { id: "event-3", kind: "strategy_change", title: "Strategy changed", detail: "The next angle is different.", dedupeKey: "strategy:1" },
    ]);
    expect(selected.map((item) => item.eventId)).toEqual(["event-1", "event-3"]);
  });

  it("sends a periodic recap only when the window contains meaningful change", () => {
    const quiet = resolvePeriodicRecap([{ type: "execution", title: "Action verified", detail: "One post was published." }], { periodStart: "2026-09-15" });
    expect(quiet.disposition).toBe("silent");

    const recap = resolvePeriodicRecap([
      { id: "breakthrough-1", kind: "breakthrough", title: "Breakthrough", detail: "A useful audience pattern emerged." },
      { type: "execution", title: "Action verified", detail: "One post was published." },
    ], { periodStart: "2026-09-15", periodEnd: "2026-09-16" });
    expect(recap).toMatchObject({ disposition: "proactive_update", kind: "periodic_recap", importance: "meaningful", eventIds: ["breakthrough-1"] });
    expect(recap.summary).toContain("Breakthrough");
  });
});
