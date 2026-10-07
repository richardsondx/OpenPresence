import { describe, expect, it } from "vitest";
import { projectWorkJourneys } from "../lib/work-journey";
import type { LiveEvent, OpenPresenceState, OperatorConversationMessage } from "../lib/types";

const time = "2026-10-01T15:00:00Z";
const now = new Date(time);
const request = (id: string, content = "Research the new conversation"): OperatorConversationMessage => ({ id, role: "operator", content, timestamp: time });
const receipt = (id: string, replyToMessageId: string, value: unknown): OperatorConversationMessage => ({ id, replyToMessageId, role: "system", content: JSON.stringify(value), timestamp: "2026-10-01T15:01:00Z" });
function state(messages: OperatorConversationMessage[] = [], events: LiveEvent[] = []): OpenPresenceState {
  return { activeAgentId: "agent", operatorConversations: [{ id: "chat", agentId: "agent", presenceId: "presence", title: "Private chat", createdAt: time, updatedAt: time, messages }], events, assignments: [], assignmentRuns: [], executions: [], outcomes: [], attentionEpisodes: [], operatorNudges: [] } as unknown as OpenPresenceState;
}
const event = (id: string, extra: Partial<LiveEvent> = {}): LiveEvent => ({ id, type: "system", title: "Work recorded", detail: "Actual persisted detail", tone: "neutral", time, presenceId: "presence", ...extra });

describe("Today work journeys", () => {
  it("preserves failed attempts and a successful alternative in one request with actual inputs and outputs", () => {
    const value = state([request("turn"), receipt("failed", "turn", { tool: "search_web", query: "electricity", error: "Search unavailable" }), receipt("read", "turn", { tool: "read_web", url: "https://example.com", result: { title: "Evidence", content: "Returned source text" } }), { id: "answer", replyToMessageId: "turn", role: "presence", content: "I found the source.", timestamp: "2026-10-01T15:02:00Z" }]);
    const [journey] = projectWorkJourneys(value, "presence", now);
    expect(journey.status).toBe("completed");
    expect(journey.steps.find((step) => step.id === "failed")).toMatchObject({ kind: "tool", status: "failed", input: { query: "electricity" }, output: "Search unavailable" });
    expect(journey.steps.find((step) => step.id === "read")).toMatchObject({ kind: "tool", input: { url: "https://example.com" }, output: { content: "Returned source text" } });
  });
  it("keeps interleaved replies attached to their request rather than the most recent message", () => {
    const value = state([request("one", "First request"), { ...request("two", "Follow-up request"), timestamp: "2026-10-01T15:00:30Z" }, receipt("old-reply", "one", { tool: "read_web", result: { title: "First source" } }), receipt("new-reply", "two", { tool: "search_web", query: "Second question" })]);
    const journeys = projectWorkJourneys(value, "presence", now);
    expect(journeys.find((item) => item.id.endsWith(":one"))?.steps.map((step) => step.id)).toEqual(["one", "old-reply"]);
    expect(journeys.find((item) => item.id.endsWith(":two"))?.steps.map((step) => step.id)).toEqual(["two", "new-reply"]);
  });
  it("does not label a delegated responsibility complete merely because the main chat answered", () => {
    const value = state([request("turn"), receipt("delegate", "turn", { tool: "assignment", assignmentId: "assignment", status: "active" }), { id: "answer", role: "presence", replyToMessageId: "turn", content: "The work is underway.", timestamp: "2026-10-01T15:02:00Z" }]);
    value.assignments = [{ id: "assignment", agentId: "agent", presenceId: "presence", status: "working", title: "Research the conversation", createdAt: time }] as OpenPresenceState["assignments"];
    const journeys = projectWorkJourneys(value, "presence", now);
    expect(journeys).toHaveLength(1);
    expect(journeys[0]).toMatchObject({ status: "working", kind: "assignment", title: "Research the conversation" });
  });
  it("requires an outcome before treating succeeded execution as verified completion", () => {
    const value = state([request("turn"), receipt("send", "turn", { tool: "social_action", result: [{ executionId: "execution", status: "succeeded", verified: false }] })]);
    value.executions = [{ id: "execution", presenceId: "presence", status: "succeeded" }] as OpenPresenceState["executions"];
    expect(projectWorkJourneys(value, "presence", now)[0].status).toBe("waiting");
    value.outcomes = [{ id: "outcome", executionId: "execution", presenceId: "presence", status: "succeeded" }] as OpenPresenceState["outcomes"];
    expect(projectWorkJourneys(value, "presence", now)[0].status).toBe("completed");
  });
  it("never guesses tool calls or completion from a title", () => {
    const [journey] = projectWorkJourneys(state([], [event("claim", { title: "Verified completed published tool call" })]), "presence", now);
    expect(journey.status).toBe("recorded");
    expect(journey.steps[0].kind).toBe("event");
  });
  it("merges transitive causal links but keeps shared sessions and sources separate", () => {
    const events = [event("one", { runId: "run", sessionId: "session" }), event("two", { executionId: "execution", sessionId: "session" }), event("bridge", { runId: "run", executionId: "execution" }), event("separate", { sessionId: "session", sourceObjectId: "source" }), event("separate-two", { sourceObjectId: "source" })];
    const journeys = projectWorkJourneys(state([], events), "presence", now);
    expect(journeys).toHaveLength(3);
    expect(journeys.find((journey) => journey.steps.length === 3)?.steps.map((step) => step.id)).toEqual(["one", "two", "bridge"]);
  });
  it("bundles repeated operational notices and preserves every attempt for inspection", () => {
    const value = state([], [event("delay-one", { title: "Browser observation delayed", tone: "warning" }), event("delay-two", { title: "Browser observation delayed", tone: "warning", time: "2026-10-01T15:03:00Z" })]);
    const [journey] = projectWorkJourneys(value, "presence", now);
    expect(journey.kind).toBe("notice");
    expect(journey.steps).toHaveLength(2);
    expect(journey.time).toBe("2026-10-01T15:03:00Z");
    expect(journey.summary).toContain("2 recorded attempts");
  });
  it("keeps another agent or Presence's private receipts out of the journey", () => {
    const value = state([request("current")], [event("foreign", { presenceId: "other" })]);
    value.operatorConversations!.push({ ...value.operatorConversations![0], id: "foreign", agentId: "other-agent", messages: [request("foreign-request")] });
    expect(projectWorkJourneys(value, "presence", now).flatMap((journey) => journey.steps.map((step) => step.id))).toEqual(["current"]);
  });
  it("includes delegated worker attempts and their run-linked failure evidence", () => {
    const value = state([request("turn"), receipt("delegate", "turn", { tool: "assignment", assignmentId: "assignment" }), { id: "answer", role: "presence", replyToMessageId: "turn", content: "All done!", timestamp: "2026-10-01T15:02:00Z" }], [event("worker-error", { runId: "worker", tone: "warning", detail: "Source unavailable" })]);
    value.assignments = [{ id: "assignment", agentId: "agent", presenceId: "presence", status: "blocked", title: "Research", createdAt: time }] as OpenPresenceState["assignments"];
    value.assignmentRuns = [{ id: "worker", assignmentId: "assignment", presenceId: "presence", status: "failed", attempts: 2, updatedAt: "2026-10-01T15:03:00Z", lastError: "Source unavailable" }] as OpenPresenceState["assignmentRuns"];
    const [journey] = projectWorkJourneys(value, "presence", now);
    expect(journey.status).toBe("needs_you");
    expect(journey.steps.map((step) => step.id)).toContain("worker-error");
    expect(journey.steps.find((step) => step.id === "worker")).toMatchObject({ title: "Attempt 2", status: "failed" });
    expect(journey.summary).toContain("Source unavailable");
    expect(journey.summary).not.toContain("All done!");
  });
  it("bounds raw receipt data and redacts secrets and media bytes", () => {
    const value = state([request("turn", "A".repeat(1000)), receipt("tool", "turn", { tool: "read_web", url: "https://example.com", apiKey: "secret", result: { accessToken: "private", dataUrl: "data:image/png;base64,AAA", content: "x".repeat(9000), items: Array.from({ length: 100 }, (_, index) => index) } })]);
    const [journey] = projectWorkJourneys(value, "presence", now);
    const step = journey.steps.find((item) => item.id === "tool")!;
    expect(journey.title.length).toBe(100);
    expect(step.input).toMatchObject({ apiKey: "[Private value omitted]" });
    expect(step.output).toMatchObject({ accessToken: "[Private value omitted]", dataUrl: "[Private value omitted]" });
    expect(JSON.stringify(step.output)).not.toContain("AAA");
    expect(JSON.stringify(step.output)).toContain("Result truncated");
  });
  it("recognizes review and acknowledgement states exactly", () => {
    const value = state([request("turn"), receipt("delegate", "turn", { tool: "assignment", assignmentId: "assignment", status: "awaiting_review" })]);
    expect(projectWorkJourneys(value, "presence", now)[0].status).toBe("needs_you");
    value.operatorNudges = [{ presenceId: "presence", messageId: "turn", status: "acknowledged" }] as OpenPresenceState["operatorNudges"];
    value.operatorConversations![0].messages = [request("turn")];
    expect(projectWorkJourneys(value, "presence", now)[0].status).toBe("working");
  });
  it("does not rewrite old timeout steps as completed when delivery later succeeds", () => {
    const value = state([], [event("timeout", { tone: "warning", executionId: "execution", detail: "Delivery timed out" }), event("verified", { outcomeId: "outcome", executionId: "execution", time: "2026-10-01T15:03:00Z" })]);
    value.executions = [{ id: "execution", presenceId: "presence", status: "succeeded" }] as OpenPresenceState["executions"];
    value.outcomes = [{ id: "outcome", executionId: "execution", status: "succeeded" }] as OpenPresenceState["outcomes"];
    const [journey] = projectWorkJourneys(value, "presence", now);
    expect(journey.status).toBe("completed");
    expect(journey.steps.find((step) => step.id === "timeout")?.status).toBe("needs_you");
    expect(journey.steps.find((step) => step.id === "verified")?.status).toBe("completed");
  });
  it("includes tasks updated today even when their request and creation were yesterday", () => {
    const assignment = { id: "assignment", agentId: "agent", presenceId: "presence", status: "working", title: "Research", createdAt: "2026-09-30T15:00:00Z", updatedAt: time };
    const standalone = state();
    standalone.assignments = [assignment] as OpenPresenceState["assignments"];
    expect(projectWorkJourneys(standalone, "presence", now)).toHaveLength(1);
    const joined = state([{ ...request("turn"), timestamp: assignment.createdAt }, { ...receipt("delegate", "turn", { tool: "assignment", assignmentId: "assignment", status: "active" }), timestamp: assignment.createdAt }]);
    joined.assignments = [assignment] as OpenPresenceState["assignments"];
    const journeys = projectWorkJourneys(joined, "presence", now);
    expect(journeys).toHaveLength(1);
    expect(journeys[0].steps.find((step) => step.id === "assignment:assignment:state")).toMatchObject({ time, status: "working", kind: "update" });
  });
  it("keeps omitted delegated work pending when only its successful handoff receipt remains", () => {
    const value = state([request("turn"), receipt("delegate", "turn", { tool: "assignment", assignmentId: "omitted", result: { assignmentId: "omitted", status: "queued" } }), { id: "answer", role: "presence", replyToMessageId: "turn", content: "The work is handed off.", timestamp: time }]);
    expect(projectWorkJourneys(value, "presence", now)[0].status).toBe("working");
    const unknown = state([request("turn"), receipt("delegate", "turn", { tool: "assignment", assignmentId: "omitted" })]);
    expect(projectWorkJourneys(unknown, "presence", now)[0].status).toBe("waiting");
  });
  it("redacts generic token fields from selected tool results", () => {
    const value = state([request("turn"), receipt("read", "turn", { tool: "read_web", result: { token: "private-token", content: "Safe evidence" } })]);
    expect(projectWorkJourneys(value, "presence", now)[0].steps.find(step => step.id === "read")?.output).toEqual({ token: "[Private value omitted]", content: "Safe evidence" });
  });
  it("retains yesterday's start and receipts for work updated today", () => {
    const value = state([{ ...request("turn"), timestamp: "2026-09-30T15:00:00Z" }, receipt("today", "turn", { tool: "read_web", result: { title: "Evidence" } })]);
    expect(projectWorkJourneys(value, "presence", now)[0].steps).toHaveLength(2);
  });
});
