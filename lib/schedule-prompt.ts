import type { Assignment, AssignmentDelegationPolicy, AssignmentPlan, OpenPresenceState, PresenceEnvironment } from "./types";
import { compileAssignmentInstruction, derivePresenceCapabilityManifest } from "./runtime";

export type SchedulePromptPlan = Omit<AssignmentPlan, "id" | "assignmentId" | "revision" | "createdAt" | "updatedAt">;

/** The durable operation shape used by the prompt review/confirmation flow. */
export interface SchedulePromptDraft {
  instruction: string;
  schedule: { day: string; time: string; executionWindow: string };
  objective?: string;
  environment?: PresenceEnvironment;
  delegationPolicy?: AssignmentDelegationPolicy;
  plan?: SchedulePromptPlan;
}

export interface SchedulePromptProposal {
  id: string;
  prompt: string;
  presenceId: string;
  summary: string;
  assumptions: string[];
  drafts: SchedulePromptDraft[];
  previews: Array<Pick<Assignment, "instruction" | "objective" | "schedule" | "preflight" | "deliverable" | "recurrence"> & { plan?: SchedulePromptPlan }>;
}

interface ModelScheduleDraft {
  instruction?: unknown;
  day?: unknown;
  time?: unknown;
  executionWindow?: unknown;
  objective?: unknown;
}

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const roleKinds = [
  "founders",
  "hiring managers",
  "engineering leaders",
  "recruiters",
  "developers",
  "independent builders",
  "technical practitioners",
  "people with a useful perspective",
];

function firstCount(prompt: string) {
  const match = prompt.match(/\b(\d{1,2})\b/);
  const count = match ? Number(match[1]) : 5;
  return Math.max(1, Math.min(24, Number.isFinite(count) ? count : 5));
}

function objectiveFor(prompt: string) {
  if (/teach|learn|education|explain|lesson/i.test(prompt)) return "education";
  if (/relationship|connect|conversation|interact|engag|reply|founder|recruit|hiring|developer/i.test(prompt)) return "relationship";
  if (/reflect|thought|journal/i.test(prompt)) return "reflection";
  return "audience_growth";
}

function cleanTopic(prompt: string) {
  const about = prompt.match(/\b(?:about|around|focused?\s+on|cover(?:ing)?)\s+(.+?)(?:[.!?]|$)/i)?.[1];
  return (about ?? prompt)
    .replace(/^\s*(?:create|plan|schedule|build|make|set\s+up|give\s+me)\b\s*/i, "")
    .replace(/\b\d{1,2}\b/g, "")
    .replace(/\b(each|every|per|daily|day|weekday|workday)\b/gi, "")
    .replace(/\b(?:worthwhile|meaningful|genuine|distinct|qualified)\b/gi, "")
    .replace(/\b(?:interactions?|conversations?|engagements?)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:.–-]+|[\s,;:.–-]+$/g, "")
    .trim();
}

function cleanAudience(prompt: string) {
  const audience = prompt.match(/\bwith\s+(.+?)(?:[.!?]|$)/i)?.[1];
  if (!audience) return "";
  return audience
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:.–-]+|[\s,;:.–-]+$/g, "")
    .trim();
}

function roleFor(index: number, prompt: string) {
  const explicitRoles = roleKinds.filter((role) => new RegExp(`\\b${role.replace(" ", "\\s+")}\\b`, "i").test(prompt));
  return (explicitRoles.length ? explicitRoles : roleKinds)[index % (explicitRoles.length || roleKinds.length)];
}

function timeFor(index: number) {
  // A calm, human-scale workday with one additional evening slot when the
  // request contains more than seven interactions.
  const minutes = 8 * 60 + index * 75;
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function addMinutes(time: string, amount: number) {
  const [hour, minute] = time.split(":").map(Number);
  const total = hour * 60 + minute + amount;
  return `${String(Math.floor((total % (24 * 60)) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function isAdaptiveDistributionPrompt(prompt: string) {
  return Boolean(prompt.match(/https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i))
    && /\b(?:promot|amplif|distribut|surface|share|reach|right people|genuinely care|attention)\b/i.test(prompt);
}

function adaptiveDistributionPlan(source: OpenPresenceState, presenceId: string, prompt: string): SchedulePromptPlan {
  const manifest = derivePresenceCapabilityManifest(source, presenceId);
  const actionLabels = manifest.items
    .filter((item) => ["reply", "quote", "repost", "like", "follow"].includes(item.capability) && item.canExecute && item.canVerify)
    .map((item) => item.label);
  const discovery = manifest.items.find((item) => item.capability === "public_discovery");
  const measurement = manifest.items.find((item) => item.capability === "post_performance");
  const sourceUrl = prompt.match(/https?:\/\/[^\s<>()]+/i)?.[0]?.replace(/[.,!?;:]+$/, "") ?? "the linked post";
  return {
    summary: `Build qualified attention for ${sourceUrl} through relevant public conversations, not blanket promotion.`,
    dailyTargets: ["Inspect the source post and current relevant conversations each day.", "Choose the strongest earned opportunity; do not force an action to satisfy a quota."],
    publishingApproach: ["Prefer a useful reply or distinct quote when the conversation earns one.", "Use repost or like only when the original is worth passing along without extra framing.", "Never paste the link into an unrelated conversation or repeat the same pitch."],
    discoveryDirections: [discovery?.canObserve ? "Search live public conversations where the post's idea is already relevant." : "Use the Social Mirror's observed conversations; public search is not currently available."],
    relationshipFocus: ["People and communities with demonstrated interest in the post's subject, prioritizing relevance over reach."],
    hypotheses: ["Contextual participation in an already-relevant conversation should create stronger qualified attention than generic promotion."],
    capabilitiesConsidered: actionLabels.length ? actionLabels : ["No verified public action is currently available"],
    stopConditions: ["Stop when no relevant conversation earns a useful contribution.", "Pause when the target author or conversation boundary indicates the Presence should not continue.", "Keep public actions in the configured review/approval mode."],
    evidenceNeeded: [discovery?.canObserve ? "Observed public conversation context" : "Fresh Social Mirror observations", measurement?.canObserve ? "Post-performance observations after delivery" : "No live performance measurement is currently available"],
    nextWeeklyReviewAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    nextStrategicReviewAt: new Date(Date.now() + 28 * 86_400_000).toISOString(),
    source: "agent",
  };
}

/**
 * Turn broad operator intent into a reviewable set of independent
 * responsibilities. This deliberately has a deterministic path so offline
 * workspaces never silently turn a prompt into one oversized Assignment.
 */
export function analyzeSchedulePrompt(source: OpenPresenceState, prompt: string, presenceId?: string): SchedulePromptProposal {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) throw new Error("Describe what you want the schedule to accomplish.");
  const presence = source.presences.find((item) => item.id === (presenceId ?? source.activePresenceId)) ?? source.presence;
  if (!presence) throw new Error("Choose a Presence before creating a schedule.");
  if (isAdaptiveDistributionPrompt(cleanPrompt)) {
    const plan = adaptiveDistributionPlan(source, presence.id, cleanPrompt);
    const time = timeFor(0);
    const sourceUrl = cleanPrompt.match(/https?:\/\/[^\s<>()]+/i)?.[0]?.replace(/[.,!?;:]+$/, "") ?? "the linked post";
    const instruction = `Each day, help ${sourceUrl} reach people who genuinely care. Inspect the source post and relevant live conversations, identify the strongest earned opportunity, and choose the most useful authorized action—reply, quote, repost, like, or follow—only when it adds value. Never force a quota, paste the link into an unrelated conversation, or repeat a pitch; use informed silence when no opportunity earns attention. Public actions remain subject to the Presence execution envelope and configured review policy.`;
    const schedule = { day: "Daily", time, executionWindow: `${time}–${addMinutes(time, 600)}` };
    const draft: SchedulePromptDraft = { instruction, schedule, objective: "audience_growth", environment: presence.connectionMode === "sandbox" ? "sandbox" : "live", delegationPolicy: "keep_moving", plan };
    const preview = compileAssignmentInstruction(source, draft.instruction, presence.id, draft.environment, undefined, draft.schedule, draft.delegationPolicy, draft.objective);
    return {
      id: `schedule-prompt-${Date.now().toString(36)}`,
      prompt: cleanPrompt,
      presenceId: presence.id,
      summary: "One adaptive daily Assignment to build qualified attention for the linked post.",
      assumptions: [
        "Create one recurring daily responsibility; the Agent chooses whether any action is earned each day.",
        "The Agent will consider the Presence's verified discovery, reply, quote, repost, like, follow, review, and measurement capabilities before acting.",
        "No fixed interaction quota, unrelated link-dropping, or guaranteed reach is assumed.",
        "Nothing is saved until you confirm this complete proposal.",
      ],
      drafts: [draft],
      previews: [{ instruction: preview.instruction, objective: preview.objective, schedule: preview.schedule, preflight: preview.preflight, deliverable: preview.deliverable, recurrence: preview.recurrence, plan }],
    };
  }
  const count = firstCount(cleanPrompt);
  const isDaily = /\b(?:daily|every\s+day|each\s+day|per\s+day)\b/i.test(cleanPrompt);
  const objective = objectiveFor(cleanPrompt);
  const audience = cleanAudience(cleanPrompt);
  const explicitTopic = /\b(?:about|around|focused?\s+on|cover(?:ing)?)\b/i.test(cleanPrompt);
  const topic = (explicitTopic ? cleanTopic(cleanPrompt) : audience ? "worthwhile relationship-building" : cleanTopic(cleanPrompt)).replace(/\bwith\s*$/i, "").trim() || presence.brief.primaryTerritory.slice(0, 2).join(" and ") || "worthwhile relationship-building";
  const environment = presence.connectionMode === "sandbox" ? "sandbox" : "live";
  // A quantity plus a cadence is one recurring responsibility. Do not turn
  // “8 daily interactions” into eight items on one weekday: that changes the
  // operator's meaning from eight per day to eight total responsibilities.
  const draftCount = isDaily ? 1 : count;
  const drafts: SchedulePromptDraft[] = Array.from({ length: draftCount }, (_, index) => {
    const time = timeFor(index);
    // “Daily” is a cadence, not a Tuesday assignment. The explicit Daily
    // value is consumed by the scheduler and the calendar expands it across
    // every day of the week.
    const day = isDaily ? "Daily" : "Tuesday";
    const role = roleFor(index, cleanPrompt);
    return {
      instruction: isDaily
        ? `Each day, find ${count} worthwhile interactions with ${audience || role} about ${topic}. Ask a genuine question or offer a useful perspective when each moment earns it; leave it alone when it does not.`
        : `At this slot, find one worthwhile interaction with ${role} about ${topic}. Ask a genuine question or offer a useful perspective when the moment earns it; leave it alone when it does not.`,
      schedule: { day, time, executionWindow: `${time}–${addMinutes(time, 150)}` },
      objective,
      environment,
      delegationPolicy: "keep_moving",
    };
  });
  const previews = drafts.map((draft) => compileAssignmentInstruction(source, draft.instruction, presence.id, environment, undefined, draft.schedule, draft.delegationPolicy, draft.objective));
  const id = `schedule-prompt-${Date.now().toString(36)}`;
  return {
    id,
    prompt: cleanPrompt,
    presenceId: presence.id,
    summary: isDaily
      ? `One daily Assignment for ${count} worthwhile interactions focused on ${audience || topic}.`
      : `${count}-item schedule of independent responsibilities focused on ${audience || topic}.`,
    assumptions: [
      isDaily ? `Create one recurring daily Assignment with room for ${count} worthwhile interactions.` : `Create ${count} separate slots at calm daytime intervals.`,
      "Each interaction is a responsibility to consider a worthwhile moment, not a prewritten post or guaranteed publication.",
      "Nothing is saved until you confirm this complete proposal.",
    ],
    drafts,
    previews: previews.map((assignment) => ({ instruction: assignment.instruction, objective: assignment.objective, schedule: assignment.schedule, preflight: assignment.preflight, deliverable: assignment.deliverable, recurrence: assignment.recurrence })),
  };
}

/** Parse an optional model plan without allowing it to bypass the same bounds
 * as the deterministic planner. Returns undefined for malformed/overlong
 * model output so callers can keep the honest fallback. */
export function modelScheduleDrafts(source: OpenPresenceState, raw: string, fallback: SchedulePromptProposal): SchedulePromptProposal | undefined {
  const normalized = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  let parsed: { summary?: unknown; assumptions?: unknown; drafts?: unknown };
  try { parsed = JSON.parse(normalized.slice(start, end + 1)) as typeof parsed; } catch { return undefined; }
  if (!Array.isArray(parsed.drafts) || parsed.drafts.length < 1 || parsed.drafts.length > 24 || parsed.drafts.length !== fallback.drafts.length) return undefined;
  const dailyPrompt = /\b(?:daily|every\s+day|each\s+day|per\s+day)\b/i.test(fallback.prompt) || fallback.drafts[0]?.schedule.day === "Daily";
  const drafts: SchedulePromptDraft[] = [];
  for (const candidate of parsed.drafts as ModelScheduleDraft[]) {
    const instruction = typeof candidate?.instruction === "string" ? candidate.instruction.trim() : "";
    const day = typeof candidate?.day === "string" ? candidate.day.trim() : "";
    const time = typeof candidate?.time === "string" ? candidate.time.trim() : "";
    const executionWindow = typeof candidate?.executionWindow === "string" ? candidate.executionWindow.trim() : "";
    const objective = typeof candidate?.objective === "string" && ["audience_growth", "education", "relationship", "reflection"].includes(candidate.objective) ? candidate.objective : fallback.drafts[ drafts.length ]?.objective;
    if (!instruction || instruction.toLowerCase() === fallback.prompt.toLowerCase() || instruction.length > 700 || (!dailyPrompt && !weekdays.includes(day)) || (dailyPrompt && day !== "Daily" && !weekdays.includes(day)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || executionWindow.length > 40 || !/^([01]\d|2[0-3]):[0-5]\d\s*[–-]\s*([01]\d|2[0-3]):[0-5]\d$/.test(executionWindow)) return undefined;
    if (dailyPrompt && !/\b(?:daily|every\s+day|each\s+day|per\s+day)\b/i.test(instruction)) return undefined;
    drafts.push({ instruction, schedule: { day: dailyPrompt ? "Daily" : day, time, executionWindow: executionWindow || `${time}–${addMinutes(time, 150)}` }, objective: objective as string | undefined, environment: fallback.drafts[0]?.environment, delegationPolicy: "keep_moving", plan: fallback.drafts[drafts.length]?.plan });
  }
  if (new Set(drafts.map((draft) => draft.instruction.toLowerCase())).size !== drafts.length || new Set(drafts.map((draft) => `${draft.schedule.day}:${draft.schedule.time}`)).size !== drafts.length) return undefined;
  const previews = drafts.map((draft) => compileAssignmentInstruction(source, draft.instruction, fallback.presenceId, draft.environment ?? "sandbox", undefined, draft.schedule, draft.delegationPolicy, draft.objective));
  return {
    ...fallback,
    summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim().slice(0, 500) : `${drafts.length}-item schedule of independent responsibilities.`,
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim().slice(0, 500)).slice(0, 6) : fallback.assumptions,
    drafts,
    previews: previews.map((assignment, index) => ({ instruction: assignment.instruction, objective: assignment.objective, schedule: assignment.schedule, preflight: assignment.preflight, deliverable: assignment.deliverable, recurrence: assignment.recurrence, plan: drafts[index]?.plan })),
  };
}
