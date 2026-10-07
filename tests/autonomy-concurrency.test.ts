import { afterEach, describe, expect, it, vi } from "vitest";
import { autonomyRunHasPriority, autonomyWorkerConcurrencyLimit, operatorChatHasAnsweredUserActionHold } from "../lib/autonomy-worker";
import type { OperationalRun, OpenPresenceState } from "../lib/types";

describe("autonomy worker concurrency", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lets a follow-up pass an answered user-action hold while preserving active turn serialization", () => {
    const run = { id: "held-run", createdAt: new Date().toISOString(), attemptCount: 0, recoveryCount: 0, kind: "operator_chat", presenceId: "selected", state: "waiting", stage: "waiting.user_action", metadata: { operatorMessageId: "question" } } as OperationalRun;
    const source = { operatorConversations: [{ presenceId: "selected", messages: [
      { id: "question", role: "operator", content: "Read this post" },
      { id: "reply", role: "presence", replyToMessageId: "question", content: "Please sign in so I can read it." },
    ] }] } as Pick<OpenPresenceState, "operatorConversations">;
    expect(operatorChatHasAnsweredUserActionHold(run, source)).toBe(true);
    expect(operatorChatHasAnsweredUserActionHold(run, source, true)).toBe(false);
    expect(operatorChatHasAnsweredUserActionHold({ ...run, leaseOwner: "other-worker", leaseExpiresAt: new Date(Date.now() + 60_000).toISOString() }, source)).toBe(false);
    expect(operatorChatHasAnsweredUserActionHold({ ...run, state: "running" }, source)).toBe(false);
    expect(operatorChatHasAnsweredUserActionHold({ ...run, stage: "waiting.provider_quota" }, source)).toBe(false);
    expect(operatorChatHasAnsweredUserActionHold({ ...run, stage: "operator_chat.continuing" }, source)).toBe(false);
    expect(operatorChatHasAnsweredUserActionHold({ ...run, presenceId: "other" }, source)).toBe(false);
    expect(operatorChatHasAnsweredUserActionHold(run, { operatorConversations: [{ ...source.operatorConversations![0], messages: source.operatorConversations![0].messages.slice(0, 1) }] })).toBe(false);
    expect(operatorChatHasAnsweredUserActionHold({ ...run, metadata: { operatorMessageId: "another-turn" } }, source)).toBe(false);
  });

  it("protects the development UI with one provider/model worker", () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.OPENPRESENCE_AUTONOMY_MAX_CONCURRENCY;
    expect(autonomyWorkerConcurrencyLimit()).toBe(1);
  });

  it("honors an explicit bounded concurrency override", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("OPENPRESENCE_AUTONOMY_MAX_CONCURRENCY", "3");
    expect(autonomyWorkerConcurrencyLimit()).toBe(3);
    vi.stubEnv("OPENPRESENCE_AUTONOMY_MAX_CONCURRENCY", "99");
    expect(autonomyWorkerConcurrencyLimit()).toBe(4);
  });

  it("marks Bridge inbound attention as priority without broadening the worker bound", () => {
    const run = { kind: "attention", attention: { source: "bridge", triggers: ["inbound_event"], scope: "broad", requestedAt: new Date().toISOString(), signalIds: ["signal"] } } as OperationalRun;
    expect(autonomyRunHasPriority(run)).toBe(true);
    expect(autonomyRunHasPriority({ kind: "discovery" } as OperationalRun)).toBe(false);
  });
});
