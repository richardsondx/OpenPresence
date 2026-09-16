import type { OpenPresenceState, ResourceUsageEvent } from "./types";

type UsageWorkspace = Pick<OpenPresenceState, "agent" | "presences" | "resourceUsageEvents">;

/** Attribute Usage events to their Agent owner and deduplicate compatibility snapshots. */
export function canonicalUsageEvents(workspaces: UsageWorkspace[], knownAgentIds = new Set(workspaces.map((workspace) => workspace.agent?.id).filter((id): id is string => Boolean(id)))) {
  const presenceOwners = new Map<string, string>();
  for (const workspace of workspaces) {
    if (!workspace.agent?.id) continue;
    for (const presence of workspace.presences ?? []) presenceOwners.set(presence.id, workspace.agent.id);
  }
  const seen = new Set<string>();
  const eventsByAgent = new Map<string, ResourceUsageEvent[]>();
  for (const workspace of workspaces) {
    for (const event of workspace.resourceUsageEvents ?? []) {
      const ownerId = knownAgentIds.has(event.agentId)
        ? event.agentId
        : event.presenceId ? presenceOwners.get(event.presenceId) ?? workspace.agent?.id : workspace.agent?.id;
      if (!ownerId) continue;
      const eventKey = event.id || `${ownerId}:${event.invocationId}:${event.createdAt}`;
      if (seen.has(eventKey)) continue;
      seen.add(eventKey);
      const ownerEvents = eventsByAgent.get(ownerId);
      if (ownerEvents) ownerEvents.push(event);
      else eventsByAgent.set(ownerId, [event]);
    }
  }
  return eventsByAgent;
}

export type UsageSummaryRange = "24h" | "7d" | "30d" | "all";

export type RecordedUsageSummary = {
  range: UsageSummaryRange;
  since?: string;
  until: string;
  eventCount: number;
  apiRequests: number;
  xReads: number;
  xWrites: number;
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  byOrigin: Array<{ origin: string; requests: number; totalTokens: number; events: number }>;
  byAction: Array<{ action: string; requests: number; events: number }>;
};

const rangeDurationMs: Record<Exclude<UsageSummaryRange, "all">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

function eventRequests(event: ResourceUsageEvent) {
  return Math.max(0, event.usage.requests ?? 1);
}

/** Summarize the persisted runtime ledger without pretending it is provider billing. */
export function summarizeRecordedUsage(events: ResourceUsageEvent[], options: { range?: UsageSummaryRange; now?: Date } = {}): RecordedUsageSummary {
  const range = options.range ?? "all";
  const until = options.now ?? new Date();
  const sinceMs = range === "all" ? undefined : until.getTime() - rangeDurationMs[range];
  const selected = events.filter((event) => {
    const timestamp = Date.parse(event.createdAt);
    return Number.isFinite(timestamp) && (sinceMs === undefined || timestamp >= sinceMs) && timestamp <= until.getTime();
  });
  const byOrigin = new Map<string, { requests: number; totalTokens: number; events: number }>();
  const byAction = new Map<string, { requests: number; events: number }>();
  let apiRequests = 0;
  let xReads = 0;
  let xWrites = 0;
  let modelCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  let totalTokens = 0;
  for (const event of selected) {
    const requests = eventRequests(event);
    const origin = event.originKind || event.attentionSource || "unknown";
    const originSummary = byOrigin.get(origin) ?? { requests: 0, totalTokens: 0, events: 0 };
    originSummary.requests += requests;
    originSummary.totalTokens += event.usage.totalTokens ?? 0;
    originSummary.events += 1;
    byOrigin.set(origin, originSummary);
    const action = event.action || `${event.provider} ${event.category}`;
    const actionSummary = byAction.get(action) ?? { requests: 0, events: 0 };
    actionSummary.requests += requests;
    actionSummary.events += 1;
    byAction.set(action, actionSummary);
    if (event.category === "model" || event.category === "vision") {
      modelCalls += requests;
      inputTokens += event.usage.inputTokens ?? 0;
      outputTokens += event.usage.outputTokens ?? 0;
      reasoningTokens += event.usage.reasoningTokens ?? 0;
      totalTokens += event.usage.totalTokens ?? 0;
    } else {
      apiRequests += requests;
      if (event.category === "channel_read") xReads += requests;
      if (event.category === "channel_write") xWrites += requests;
    }
  }
  return {
    range,
    since: sinceMs === undefined ? selected.reduce<string | undefined>((oldest, event) => !oldest || event.createdAt < oldest ? event.createdAt : oldest, undefined) : new Date(sinceMs).toISOString(),
    until: until.toISOString(),
    eventCount: selected.length,
    apiRequests,
    xReads,
    xWrites,
    modelCalls,
    inputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
    byOrigin: [...byOrigin.entries()].map(([origin, value]) => ({ origin, ...value })).sort((left, right) => right.totalTokens - left.totalTokens || right.requests - left.requests),
    byAction: [...byAction.entries()].map(([action, value]) => ({ action, ...value })).sort((left, right) => right.requests - left.requests || right.events - left.events),
  };
}

const count = (value: number) => value.toLocaleString("en-US");
const shortOrigin = (origin: string) => origin.replaceAll("_", " ");

/** Answer recorded-usage questions from the ledger before invoking a model. */
export function operatorUsageReply(source: OpenPresenceState, content: string, events = source.resourceUsageEvents ?? [], now = new Date()) {
  const normalized = content.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
  const hasResourceTerm = /\b(?:tokens?|credits?|usage|api calls?|requests?)\b/.test(normalized);
  const hasHistoryTerm = /\b(?:what did|where did|how much|how many|history|breakdown|ledger|summary|details?|used|spent|spend|consum(?:e|ed|ption)|wast(?:ed|e))\b/.test(normalized);
  const asksForBalanceOnly = /\b(?:remaining|left|balance|available)\b/.test(normalized)
    && !/\b(?:spent|spend|used|wasted|consum|history|breakdown|ledger)\b/.test(normalized);
  const asksForHistory = hasResourceTerm && hasHistoryTerm && !asksForBalanceOnly;
  const asksForFreshProbe = /^(?:please\s+)?(?:check|test|verify|refresh|inspect|run)\b/.test(normalized)
    && /\b(?:credit|connection|account|x|api)\b/.test(normalized)
    && !/\b(?:what|where|how much|how many|history|breakdown|spent|used|wasted|ledger)\b/.test(normalized);
  if (!asksForHistory || asksForFreshProbe) return undefined;
  const summary = summarizeRecordedUsage(events, { range: "all", now });
  const agentName = source.agent?.name || source.presence?.name || "this Agent";
  if (!summary.eventCount) return `I don’t have a recorded usage ledger for ${agentName} yet. I can report local runtime usage once calls are recorded.`;
  const origins = summary.byOrigin.filter((item) => item.totalTokens > 0).slice(0, 5)
    .map((item) => `${shortOrigin(item.origin)} (${count(item.totalTokens)} tokens)`).join(", ");
  const actions = summary.byAction.slice(0, 5).map((item) => `${item.action} (${count(item.requests)} request${item.requests === 1 ? "" : "s"})`).join(", ");
  const recordedWindow = summary.since ? ` from ${new Date(summary.since).toLocaleDateString("en-CA")} through ${new Date(summary.until).toLocaleDateString("en-CA")}` : "";
  const modelDetails = summary.totalTokens
    ? `${count(summary.totalTokens)} model tokens across ${count(summary.modelCalls)} model calls${origins ? `, mainly ${origins}` : ""}`
    : "no provider-reported model tokens";
  const connectorDetails = `${count(summary.apiRequests)} recorded connector requests (${count(summary.xReads)} reads, ${count(summary.xWrites)} writes)`;
  const failedExecutions = source.executions.filter((execution) => ["failed", "blocked", "cancelled", "expired"].includes(execution.status));
  const failedDetails = failedExecutions.length
    ? ` Delivery history also has ${count(failedExecutions.length)} public attempt${failedExecutions.length === 1 ? "" : "s"} that did not verify, including ${failedExecutions.slice(0, 3).map((execution) => `${execution.affordance} (${execution.status}${execution.failure?.code ? `, ${execution.failure.code}` : ""})`).join(", ")}. That is execution evidence, not proof that X charged each attempt.`
    : " I don’t see a recorded failed or blocked public execution in the current Agent history.";
  return `I checked ${agentName}'s recorded runtime ledger${recordedWindow}. It shows ${modelDetails}; the most common recorded actions were ${actions || "not labeled"}. ${connectorDetails}.${failedDetails} This is the local usage and API-call history I can verify, not X's billing ledger or remaining-credit balance—X does not expose that balance through this runtime.`;
}
