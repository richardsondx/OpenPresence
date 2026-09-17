import type { OpenPresenceState } from "./types";

const newCommunicationId = () => globalThis.crypto?.randomUUID?.()
  ?? `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

/**
 * Decide which completed Agent work deserves an unsolicited operator update.
 *
 * Attention, execution, and conversation records remain the source of truth.
 * This module is only the importance gate for turning an already-recorded
 * event into communication. In particular, a successful action receipt is
 * useful evidence for Activity but is not, by itself, a reason to interrupt
 * the operator's conversation.
 */

export const PROACTIVE_UPDATE_KINDS = [
  "breakthrough",
  "problem",
  "opportunity",
  "permission_change",
  "strategy_change",
  "periodic_recap",
] as const;

export type ProactiveUpdateKind = (typeof PROACTIVE_UPDATE_KINDS)[number];
export type CommunicationImportance = "routine" | "meaningful";
export type CommunicationDisposition = "proactive_update" | "routine_receipt" | "silent";

export interface AgentInitiatedCommunicationCandidate {
  title: string;
  detail: string;
  id?: string;
  time?: string;
  type?: string;
  tone?: string;
  kind?: ProactiveUpdateKind | "routine_receipt";
  importance?: CommunicationImportance;
  /** A problem or permission change may need the operator even without a warning tone. */
  operatorActionRequired?: boolean;
  /** Set by callers that know this is a scheduled summary window. */
  periodic?: boolean;
  dedupeKey?: string;
}

export interface AgentInitiatedCommunicationDecision {
  disposition: CommunicationDisposition;
  importance: CommunicationImportance;
  kind?: ProactiveUpdateKind;
  eventId?: string;
  dedupeKey: string;
  reason: string;
  summary?: string;
  eventIds?: string[];
}

const meaningfulKinds = new Set<string>(PROACTIVE_UPDATE_KINDS);
const problemWords = /\b(?:blocked|cannot|couldn't|failed|failure|failing|problem|stuck|unavailable|uncertain|expired|needs? (?:you|operator|attention)|requires? (?:you|operator)|disconnected|lost access|at capacity|not permitted)\b/i;
const permissionWords = /\b(?:permission|authority|authorized?|authorization|access|execution envelope|connection|connected|disconnected|reconnected|credential|approval|review mode)\b/i;
const strategyWords = /\b(?:strategy|strategic|plan reassess(?:ed|ment)?|direction changed|pivot(?:ed)?|approach changed|new priority|priorit(?:y|ies))\b/i;
const opportunityWords = /\b(?:opportunity|opening|signal worth|worth pursuing|qualifying|strong match|promising|could pursue)\b/i;
const breakthroughWords = /\b(?:breakthrough|milestone|turning point|important discovery|new insight|learned that|material learning|meaningful progress)\b/i;
const routineReceiptWords = /\b(?:action receipt|receipt|queued|sent|delivered|published|posted|liked|followed|reposted|quoted|replied|action verified|delivery attempted|verification pending|awaiting verification|completed action)\b/i;
const operationalProblemWords = /\b(?:failed|failure|blocked|stuck|unavailable|uncertain|expired|disconnected|lost access|not permitted|at capacity)\b/i;

const compact = (value: string) => value.replace(/\s+/g, " ").trim();

function candidateText(candidate: AgentInitiatedCommunicationCandidate) {
  return compact(`${candidate.title} ${candidate.detail}`);
}

function routineReceipt(candidate: AgentInitiatedCommunicationCandidate, text: string) {
  // A failed or blocked action is a problem, even though its title may also
  // contain a routine action word such as “publication” or “delivery”.
  if (candidate.operatorActionRequired || operationalProblemWords.test(text)) return false;
  return candidate.kind === "routine_receipt"
    || candidate.importance === "routine"
    || candidate.type === "execution"
    || routineReceiptWords.test(text);
}

function inferredKind(candidate: AgentInitiatedCommunicationCandidate, text: string): ProactiveUpdateKind | undefined {
  if (candidate.periodic) return "periodic_recap";
  if (candidate.operatorActionRequired || candidate.tone === "warning" && problemWords.test(text)) return "problem";
  if (permissionWords.test(text) && /\b(?:changed|change|restored|revoked|granted|denied|needs?|lost|new|now)\b/i.test(text)) return "permission_change";
  if (strategyWords.test(text)) return "strategy_change";
  if (opportunityWords.test(text)) return "opportunity";
  if (breakthroughWords.test(text)) return "breakthrough";
  return undefined;
}

/**
 * Resolve one durable event into the only three communication outcomes that
 * matter to the operator-facing path.
 */
export function resolveAgentInitiatedCommunication(candidate: AgentInitiatedCommunicationCandidate): AgentInitiatedCommunicationDecision {
  const title = compact(candidate.title);
  const detail = compact(candidate.detail);
  const text = candidateText(candidate);
  const dedupeKey = candidate.dedupeKey ?? candidate.id ?? `${candidate.type ?? "event"}:${title.toLowerCase()}`;
  const base = { eventId: candidate.id, dedupeKey };

  if (!title && !detail) {
    return { ...base, disposition: "silent", importance: "routine", reason: "An empty event cannot give the operator useful context." };
  }

  if (candidate.importance === "routine") {
    return {
      ...base,
      disposition: "routine_receipt",
      importance: "routine",
      reason: "The event was explicitly marked routine and should remain in the durable activity record.",
      summary: detail ? `${title}: ${detail}` : title,
    };
  }

  if (candidate.kind && candidate.kind !== "routine_receipt" && meaningfulKinds.has(candidate.kind)) {
    return {
      ...base,
      disposition: "proactive_update",
      importance: "meaningful",
      kind: candidate.kind,
      reason: "The event is an explicitly classified meaningful change.",
      summary: detail ? `${title}: ${detail}` : title,
    };
  }

  const kind = inferredKind(candidate, text);
  if (kind) {
    return {
      ...base,
      disposition: "proactive_update",
      importance: "meaningful",
      kind,
      reason: `The event contains a ${kind.replaceAll("_", " ")} that changes what the operator should know.`,
      summary: detail ? `${title}: ${detail}` : title,
    };
  }

  if (routineReceipt(candidate, text)) {
    return {
      ...base,
      disposition: "routine_receipt",
      importance: "routine",
      reason: "Routine action and delivery receipts belong in the durable activity record, not proactive conversation.",
      summary: detail ? `${title}: ${detail}` : title,
    };
  }

  return {
    ...base,
    disposition: "silent",
    importance: "routine",
    reason: "The event does not clear the importance threshold for an unsolicited update.",
  };
}

/** Alias named for callers resolving a Social/Attention event. */
export const resolveProactiveUpdate = resolveAgentInitiatedCommunication;

export function shouldSendProactiveUpdate(candidate: AgentInitiatedCommunicationCandidate) {
  return resolveAgentInitiatedCommunication(candidate).disposition === "proactive_update";
}

/** Keep one meaningful update per event key when several runtime records converge. */
export function selectProactiveUpdates(candidates: AgentInitiatedCommunicationCandidate[]) {
  const seen = new Set<string>();
  return candidates
    .map(resolveAgentInitiatedCommunication)
    .filter((decision) => {
      if (decision.disposition !== "proactive_update" || seen.has(decision.dedupeKey)) return false;
      seen.add(decision.dedupeKey);
      return true;
    });
}

export interface PeriodicRecapOptions {
  periodStart?: string;
  periodEnd?: string;
  dedupeKey?: string;
  maxItems?: number;
}

/**
 * A recap is itself meaningful only when the window contains a meaningful
 * event. A quiet window therefore stays quiet instead of becoming a heartbeat
 * or a disguised action receipt.
 */
export function resolvePeriodicRecap(candidates: AgentInitiatedCommunicationCandidate[], options: PeriodicRecapOptions = {}): AgentInitiatedCommunicationDecision {
  const notable = selectProactiveUpdates(candidates);
  const dedupeKey = options.dedupeKey ?? `periodic_recap:${options.periodStart ?? "window"}:${options.periodEnd ?? "now"}`;
  if (!notable.length) {
    return {
      disposition: "silent",
      importance: "routine",
      dedupeKey,
      reason: "The recap window contains no meaningful change; routine receipts remain in Activity.",
    };
  }

  const maxItems = Math.max(1, options.maxItems ?? 4);
  const selected = notable.slice(0, maxItems);
  return {
    disposition: "proactive_update",
    importance: "meaningful",
    kind: "periodic_recap",
    dedupeKey,
    eventIds: selected.flatMap((item) => item.eventId ? [item.eventId] : []),
    reason: "The recap contains at least one meaningful breakthrough, problem, opportunity, permission, or strategy change.",
    summary: selected.map((item) => item.summary).filter((item): item is string => Boolean(item)).join(" "),
  };
}

/** Materialize one classifier-approved update in the Presence-scoped Main conversation. */
export function recordAgentInitiatedUpdate(source: OpenPresenceState, presenceId: string, candidate: AgentInitiatedCommunicationCandidate) {
  const decision = resolveAgentInitiatedCommunication(candidate);
  if (decision.disposition !== "proactive_update" || !decision.kind || !decision.summary) return { state: source, decision, recorded: false as const };
  const state = structuredClone(source) as OpenPresenceState;
  const presence = state.presences.find((item) => item.id === presenceId) ?? state.presence;
  if (!presence) return { state, decision, recorded: false as const };
  state.operatorConversations ??= [];
  let conversation = state.operatorConversations.find((item) => item.presenceId === presenceId
    && item.status !== "archived"
    && (!item.threadId || item.threadId === `thread:${presenceId}` || item.title === "Main" || item.title === "Main thread"));
  if (!conversation) {
    const timestamp = new Date().toISOString();
    conversation = {
      id: `operator_conversation_${newCommunicationId()}`,
      agentId: state.agent?.id ?? "",
      presenceId,
      threadId: `thread:${presenceId}`,
      scope: { kind: "presence", presenceId },
      status: "active",
      title: "Main",
      createdAt: timestamp,
      updatedAt: timestamp,
      messages: [],
    };
    state.operatorConversations.unshift(conversation);
  }
  if (conversation.messages.some((message) => message.agentInitiated?.dedupeKey === decision.dedupeKey)) {
    return { state, decision, recorded: false as const };
  }
  const timestamp = new Date().toISOString();
  conversation.messages.push({
    id: `presence_message_${newCommunicationId()}`,
    role: "presence",
    content: decision.summary,
    timestamp,
    milestone: decision.kind === "problem" ? "failure" : decision.kind === "breakthrough" ? "verified" : "decision",
    agentInitiated: { kind: decision.kind, dedupeKey: decision.dedupeKey, eventId: decision.eventId },
  });
  conversation.updatedAt = timestamp;
  return { state, decision, recorded: true as const };
}
