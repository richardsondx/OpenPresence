const INTERNAL_DECISION_KEYS = new Set([
  "action",
  "conversationDisposition",
  "conversation_disposition",
  "rationale",
  "reason",
  "speechAct",
  "speech_act",
  "responseNeed",
  "response_need",
  "recommendedAction",
  "recommended_action",
  "storyCandidate",
  "story_candidate",
  "evidenceNeed",
  "evidence_need",
  "visualBrief",
  "visual_brief",
]);

function parsedObject(text: string): Record<string, unknown> | undefined {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const parsed: unknown = JSON.parse(normalized.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Internal Social Planner metadata is never public expression text. This
 * deliberately recognizes the planner's structured shape instead of banning
 * ordinary prose that happens to use words such as "action" or "rationale".
 */
export function publicExpressionLeakageReason(text: string): string | undefined {
  const parsed = parsedObject(text);
  const keys = parsed ? Object.keys(parsed).filter((key) => INTERNAL_DECISION_KEYS.has(key)) : [];
  const hasDisposition = keys.includes("conversationDisposition") || keys.includes("conversation_disposition");
  const hasDecisionShape = keys.includes("action") || hasDisposition || keys.length >= 2;
  const hasPlannerKeySyntax = /\"(?:action|conversationDisposition|conversation_disposition|rationale|speechAct|recommendedAction)\"\s*:/i.test(text) && /[{}]/.test(text);
  return hasDecisionShape || hasPlannerKeySyntax
    ? "The candidate is an internal Social Planner decision object, not public expression text."
    : undefined;
}
