import { NextResponse } from "next/server";
import { readStateSnapshot } from "@/lib/db";
import type { OpenPresenceState, ResourceUsageEvent } from "@/lib/types";
import { canonicalUsageEvents } from "@/lib/usage";

type RangeKey = "24h" | "7d" | "30d" | "all";

function numberValue(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function sum(events: ResourceUsageEvent[], selector: (event: ResourceUsageEvent) => number | undefined) {
  return events.reduce((total, event) => total + numberValue(selector(event)), 0);
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function rangeSince(range: RangeKey, now = new Date()) {
  if (range === "all") return undefined;
  if (range === "24h") return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const days = range === "7d" ? 7 : 30;
  const start = startOfUtcDay(now);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start.toISOString();
}

function periodDayKeys(range: RangeKey, since: string | undefined, until: Date, events: ResourceUsageEvent[]) {
  const end = startOfUtcDay(until);
  const start = range === "all"
    ? events.map((event) => startOfUtcDay(new Date(event.createdAt)).getTime()).filter(Number.isFinite).sort((a, b) => a - b)[0]
    : since
      ? startOfUtcDay(new Date(since)).getTime()
      : end.getTime();
  if (start === undefined || !Number.isFinite(start)) return [];
  const days: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    days.push(cursor.toISOString().slice(0, 10));
  }
  return days;
}

function eventSummary(events: ResourceUsageEvent[]) {
  const xEvents = events.filter((event) => event.provider === "x" || ["channel_read", "channel_write", "hydration", "media_fetch"].includes(event.category));
  const modelEvents = events.filter((event) => event.category === "model");
  const visionEvents = events.filter((event) => event.category === "vision");
  const reads = sum(xEvents.filter((event) => event.category === "channel_read" || event.category === "hydration" || event.category === "media_fetch"), (event) => event.usage.requests ?? 1);
  const writes = sum(xEvents.filter((event) => event.category === "channel_write"), (event) => event.usage.requests ?? 1);
  const requests = sum(xEvents, (event) => event.usage.requests ?? 1);
  const modelCalls = sum(modelEvents, (event) => event.usage.requests ?? 1);
  const visionCalls = sum(visionEvents, (event) => event.usage.requests ?? 1);
  const inputTokens = sum(modelEvents, (event) => event.usage.inputTokens);
  const outputTokens = sum(modelEvents, (event) => event.usage.outputTokens);
  const reasoningTokens = sum(modelEvents, (event) => event.usage.reasoningTokens);
  const totalTokens = sum(modelEvents, (event) => event.usage.totalTokens || (event.usage.inputTokens ?? 0) + (event.usage.outputTokens ?? 0));
  const reportedTokenEvents = modelEvents.filter((event) => event.usage.totalTokens !== undefined || event.usage.inputTokens !== undefined || event.usage.outputTokens !== undefined).length;
  const estimatedCost = sum(events, (event) => event.cost?.provenance === "estimated" ? event.cost.amount : 0);
  const reportedCost = sum(events, (event) => event.cost?.provenance === "reported" ? event.cost.amount : 0);
  return { xRequests: requests, xReads: reads, xWrites: writes, modelCalls, visionCalls, inputTokens, outputTokens, reasoningTokens, totalTokens, reportedTokenEvents, estimatedCost, reportedCost, eventCount: events.length };
}

function dayKey(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toISOString().slice(0, 10);
}

function compactOrigin(event: ResourceUsageEvent) {
  return event.attentionSource ?? event.originKind;
}

type UsageWorkspace = Pick<OpenPresenceState, "agent" | "presences" | "resourceUsageEvents">;

function workspaceList(root: OpenPresenceState): UsageWorkspace[] {
  const byAgent = new Map<string, UsageWorkspace>();
  for (const workspace of [root, ...root.agentWorkspaces]) {
    if (workspace.agent?.id && !byAgent.has(workspace.agent.id)) byAgent.set(workspace.agent.id, workspace);
  }
  return [...byAgent.values()];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedRange = url.searchParams.get("range");
  const range: RangeKey = requestedRange === "24h" || requestedRange === "7d" || requestedRange === "all" ? requestedRange : "30d";
  const agentId = url.searchParams.get("agentId") ?? "all";
  const since = rangeSince(range);
  const root = readStateSnapshot();
  const allWorkspaces = workspaceList(root);
  const workspaces = allWorkspaces.filter((workspace) => agentId === "all" || workspace.agent?.id === agentId);
  const eventsByAgent = canonicalUsageEvents(allWorkspaces, new Set(root.agents.map((agent) => agent.id)));
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const allEvents = workspaces.flatMap((workspace) => (eventsByAgent.get(workspace.agent?.id ?? "") ?? []).filter((event) => !since || event.createdAt >= since));
  const totals = eventSummary(allEvents);
  const dailyMap = new Map<string, ResourceUsageEvent[]>();
  for (const event of allEvents) {
    const key = dayKey(event.createdAt);
    dailyMap.set(key, [...(dailyMap.get(key) ?? []), event]);
  }
  const daily = periodDayKeys(range, since, nowDate, allEvents).map((date) => ({ date, ...eventSummary(dailyMap.get(date) ?? []) }));
  const agents = workspaces.map((workspace) => {
    const events = (eventsByAgent.get(workspace.agent?.id ?? "") ?? []).filter((event) => !since || event.createdAt >= since);
    const summary = eventSummary(events);
    const originsMap = new Map<string, ResourceUsageEvent[]>();
    for (const event of events) {
      const key = compactOrigin(event);
      originsMap.set(key, [...(originsMap.get(key) ?? []), event]);
    }
    const presences = (workspace.presences ?? []).map((presence) => {
      const presenceEvents = events.filter((event) => event.presenceId === presence.id);
      return { id: presence.id, name: presence.name, handle: presence.handle, channel: presence.channel, accent: presence.accent, summary: eventSummary(presenceEvents) };
    }).filter((presence) => presence.summary.eventCount > 0 || workspace.presences.length <= 3);
    return {
      id: workspace.agent?.id,
      name: workspace.agent?.name,
      accent: workspace.agent?.accent,
      summary,
      lastActivityAt: events.map((event) => event.createdAt).sort().at(-1),
      origins: [...originsMap.entries()].map(([name, originEvents]) => ({ name, ...eventSummary(originEvents) })).sort((a, b) => b.totalTokens + b.xRequests - (a.totalTokens + a.xRequests)),
      presences,
    };
  }).sort((a, b) => (b.summary.totalTokens + b.summary.xRequests) - (a.summary.totalTokens + a.summary.xRequests));
  const modelReported = allEvents.some((event) => event.category === "model" && (event.usage.totalTokens !== undefined || event.usage.inputTokens !== undefined || event.usage.outputTokens !== undefined));
  const hasModelEvents = allEvents.some((event) => event.category === "model");
  return NextResponse.json({
    range, since, until: now, generatedAt: now, scope: agentId,
    coverage: {
      x: { status: allEvents.some((event) => event.provider === "x") ? "inferred" : "unavailable", detail: "Recorded connector requests are shown. X does not expose a reliable remaining-credit balance through this runtime." },
      model: { status: modelReported ? (hasModelEvents && totals.reportedTokenEvents < totals.modelCalls ? "partial" : "reported") : hasModelEvents ? "request-only" : "unavailable", detail: "Token counts are provider-reported when returned. Mock, local, or provider responses without usage metadata remain request-only." },
    },
    totals, daily, agents,
  });
}
