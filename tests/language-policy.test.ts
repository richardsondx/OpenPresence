import { describe, expect, it } from "vitest";
import { containsLiteral, effectiveLanguagePolicy, languagesMatch, mergeLanguagePolicies, presenceLanguageGuidance, validateLanguage } from "../lib/language-policy";
import { isCognitionEligibleMirrorObject } from "../lib/social-context";
import { addSandboxEvent, applyOperation, completeNativeExecution, createAgent, deliverSandboxExecution, formChatPostIntent, formSandboxIntent, recordNativeMirror, startPlaygroundSession, targetLanguageValidationForAction } from "../lib/runtime";

const input = { name: "Jenny", description: "A useful social Agent.", mode: "agent" as const, handle: "@jenny_ai", accent: "#D68754" };

describe("Language & phrasing policy", () => {
  it("gives every Presence an explicit English language and keeps it in the Presence context", () => {
    const state = createAgent(input);
    expect(state.presence?.language).toBe("en");
    expect(state.presence?.context.language).toBe("en");
    expect(presenceLanguageGuidance(undefined)).toContain("English");
    const next = applyOperation(state, { type: "setPresence", patch: { language: "en" } });
    expect(next.presence?.language).toBe("en");
    expect(next.presence?.context.language).toBe("en");
  });

  it("matches normalized literal phrases with lexical boundaries and exact punctuation", () => {
    expect(containsLiteral("A  BAD\r\nphrase.", "bad phrase")).toBe(true);
    expect(containsLiteral("badly phrased", "bad")).toBe(false);
    expect(containsLiteral("say bad phrase!", "bad phrase.")).toBe(false);
    expect(containsLiteral("BAD phrase", "bad phrase")).toBe(true);
  });

  it("merges Agent and Presence rules additively while deduplicating", () => {
    const merged = mergeLanguagePolicies(
      { avoid: ["Great"], prohibited: ["secret"] },
      { avoid: [" great ", "maybe"], prohibited: ["SECRET", "vendor"] },
    );
    expect(merged).toEqual({ avoid: ["Great", "maybe"], prohibited: ["secret", "vendor"] });
    const state = createAgent(input);
    const next = applyOperation(applyOperation(state, { type: "setAgentLanguagePolicy", policy: { avoid: ["great"], prohibited: ["secret"] } }), {
      type: "setPresenceLanguagePolicy",
      policy: { avoid: ["warm"], prohibited: ["vendor"] },
    });
    expect(effectiveLanguagePolicy(next.agent, next.presence)).toEqual({ avoid: ["great", "warm"], prohibited: ["secret", "vendor"] });
  });

  it("keeps Avoid advisory while Never use is deterministic and blocking", () => {
    const result = validateLanguage("A great note about the vendor.", { avoid: ["great"], prohibited: ["vendor"] });
    expect(result.avoided).toEqual(["great"]);
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual([{ literal: "vendor", kind: "prohibited" }]);
  });

  it("requires observed target language to match the Presence language", () => {
    expect(languagesMatch("en", "en-US")).toBe(true);
    expect(languagesMatch("en", "pt-BR")).toBe(false);
    let state = createAgent(input);
    const sessionState = startPlaygroundSession(state, state.presence!.id, "fresh");
    state = sessionState;
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Brazilian author", content: "Eu vou votar em quem?", language: "pt" });
    const target = state.mirrorObjects[0]!.externalRef;
    expect(targetLanguageValidationForAction(state, { presenceId: state.presence!.id, target, environment: "sandbox", sessionId: session.id })).toMatchObject({ valid: false, expected: "en", observed: "pt" });
  });

  it("blocks a targeted Sandbox interaction when the observed post is not in the Presence language", () => {
    let state = createAgent(input);
    state = startPlaygroundSession(state, state.presence!.id, "fresh");
    state = applyOperation(state, { type: "setPresence", patch: { execution: { reply: "auto" } } });
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "Japanese author", content: "技術的には可能だが面倒くさい", language: "ja" });
    const target = state.mirrorObjects[0]!.externalRef;
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "reply", text: "I will leave this conversation alone.", target });
    const execution = state.executions[0]!;
    const blocked = deliverSandboxExecution(state, execution.id);
    expect(blocked.socialIntents[0]?.state).toBe("active");
    expect(blocked.executions[0]?.status).toBe("blocked");
    expect(blocked.executions[0]?.failure?.code).toBe("TARGET_LANGUAGE_MISMATCH");
    expect(blocked.mirrorObjects.filter((item) => item.actorPresenceId === state.presence?.id)).toHaveLength(0);
  });

  it("allows a targeted Sandbox interaction only after the target language matches", () => {
    let state = createAgent(input);
    state = startPlaygroundSession(state, state.presence!.id, "fresh");
    state = applyOperation(state, { type: "setPresence", patch: { execution: { reply: "auto" } } });
    const session = state.playgroundSessions[0]!;
    state = addSandboxEvent(state, { sessionId: session.id, actionId: "post", actorName: "English author", content: "What makes an agent worth following?", language: "en" });
    const target = state.mirrorObjects[0]!.externalRef;
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "reply", text: "Specific judgment makes an agent worth returning to.", target });
    const delivered = deliverSandboxExecution(state, state.executions[0]!.id);
    expect(delivered.executions[0]?.status).toBe("succeeded");
    expect(delivered.mirrorObjects.some((item) => item.actorPresenceId === state.presence?.id)).toBe(true);
  });

  it("keeps non-English native observations out of the Presence mirror", () => {
    const state = createAgent(input);
    const next = recordNativeMirror(state, { connectionId: "connection-1", presenceId: state.presence!.id, post: { id: "pt-post", text: "Uma publicação", language: "pt-BR" } });
    expect(next.mirrorObjects).toHaveLength(0);
  });

  it("does not admit unknown-language world objects to cognition", () => {
    const state = createAgent(input);
    const unknown = { id: "unknown", bridgeId: "native:test", presenceId: state.presence!.id, channelId: "x" as const, externalRef: { type: "x.post", id: "unknown" }, objectType: "post", content: { text: "No provider language tag" }, observedAt: new Date().toISOString(), visibility: "public" as const, shareability: "presence-only" as const };
    expect(isCognitionEligibleMirrorObject(unknown, state.presence!.language)).toBe(false);
  });

  it("keeps Social Intent chosen while blocking Sandbox execution and Mirror delivery", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setPresenceLanguagePolicy", policy: { avoid: [], prohibited: ["vendor"] } });
    state = startPlaygroundSession(state, state.presence!.id, "fresh");
    const session = state.playgroundSessions[0]!;
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "post", text: "A useful vendor note." });
    const execution = state.executions[0]!;
    expect(state.socialIntents[0]?.state).toBe("active");
    expect(execution.status).toBe("blocked");
    expect(execution.failure?.code).toBe("LANGUAGE_POLICY_VIOLATION");
    expect(state.mirrorObjects).toHaveLength(0);
  });

  it("rechecks the current policy immediately before Sandbox delivery", () => {
    let state = createAgent(input);
    state = startPlaygroundSession(state, state.presence!.id, "fresh");
    const session = state.playgroundSessions[0]!;
    state = formSandboxIntent(state, { sessionId: session.id, affordance: "post", text: "A clean note." });
    const execution = state.executions[0]!;
    expect(execution.status).toBe("queued");
    state = applyOperation(state, { type: "setAgentLanguagePolicy", policy: { avoid: [], prohibited: ["clean"] } });
    const checked = deliverSandboxExecution(state, execution.id);
    expect(checked.executions[0]?.status).toBe("blocked");
    expect(checked.mirrorObjects).toHaveLength(0);
  });

  it("blocks a native completion recheck and permits only an explicit operator override", () => {
    let state = createAgent(input);
    state = applyOperation(state, { type: "setAgentLanguagePolicy", policy: { avoid: [], prohibited: ["secret"] } });
    state.presence = { ...state.presence!, connectionMode: "native" };
    state.presences = state.presences.map((item) => item.id === state.presence?.id ? state.presence! : item);
    state = formChatPostIntent(state, "A secret operator-authored post.", undefined, "operator");
    const execution = state.executions[0]!;
    execution.connector = "native";
    execution.status = "queued";
    const blocked = completeNativeExecution(state, execution.id, { type: "x.post", id: "never-created" });
    expect(blocked.executions[0]?.status).toBe("blocked");
    expect(blocked.executions[0]?.source).toBe("operator");
    const overridden = applyOperation(blocked, { type: "overrideLanguagePolicy", id: execution.id });
    expect(overridden.executions[0]?.status).toBe("queued");
    expect(overridden.executions[0]?.failure).toBeUndefined();
  });
});
