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
const PUBLIC_OUTPUT_KEYS = new Set(["text", "reply", "draft", "content"]);

/** Apply the Presence's canonical public-post line format after model output. */
export function formatOneSentencePerLine(value?: string) {
  if (!value) return "";
  return value
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .flatMap((line) => {
      const sentences: string[] = [];
      let start = 0;
      const boundary = /[.!?]+(?:["'”’»)\]}]+)?(?=\s|$)/g;
      for (const match of line.matchAll(boundary)) {
        const end = (match.index ?? 0) + match[0].length;
        if (end > start) sentences.push(line.slice(start, end).trim());
        start = end;
      }
      if (start < line.length) sentences.push(line.slice(start).trim());
      return sentences.filter(Boolean);
    })
    .join("\n\n");
}

/** Apply the public format used by Presence Chat replies, preserving natural paragraph flow. */
export function formatReplyText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((line) => line
      .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .trim())
    .filter(Boolean)
    .join("\n\n");
}

function parsedObject(text?: string): Record<string, unknown> | undefined {
  if (!text) return undefined;
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

function looseJsonString(text: string, field: string): string | undefined {
  const marker = new RegExp(`"${field}"\\s*:\\s*"`, "i").exec(text);
  if (!marker) return undefined;
  const valueStart = marker.index + marker[0].length;
  const remainder = text.slice(valueStart);
  const boundary = /"\s*(?:,|})/.exec(remainder);
  const raw = (boundary ? remainder.slice(0, boundary.index) : remainder).trim();
  if (!raw) return "";
  return raw.replace(/\\n/g, "\n").replace(/\\"/g, '"');
}

function loosePlannerFields(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const fieldPattern = [...new Set([...INTERNAL_DECISION_KEYS, ...PUBLIC_OUTPUT_KEYS])].map((field) => field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`^\\s*["']?(${fieldPattern})["']?\\s*:\\s*(.*)$`, "i");
  for (const line of text.split(/\r?\n/)) {
    const match = pattern.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\'/g, "'");
    }
    fields[match[1]] = value;
  }
  return fields;
}

/**
 * Convert a planner-shaped model response into only its public wording.
 * Planner metadata is private cognition and must never be stored or rendered
 * as a Presence message. A no-op has no public expression at all.
 */
export function publicExpressionText(text: string): string {
  if (/^NO_OP$/i.test(text.trim())) return "";
  if (!publicExpressionLeakageReason(text)) return text;
  const parsed = parsedObject(text);
  if (!parsed) {
    const looseFields = loosePlannerFields(text);
    const action = /\"action\"\s*:\s*\"([^\"]+)\"/i.exec(text)?.[1]?.trim().toLowerCase() ?? looseFields.action?.trim().toLowerCase();
    if (action && ["no_op", "noop", "none", "silence", "skip"].includes(action)) return "";
    return looseJsonString(text, "text") ?? looseJsonString(text, "reply") ?? looseFields.text ?? looseFields.reply ?? "";
  }

  const rawActs = Array.isArray(parsed.acts) ? parsed.acts : [];
  if (rawActs.length > 0) {
    const publicAct = rawActs.find((value) => {
      if (!value || typeof value !== "object") return false;
      const action = (value as Record<string, unknown>).action;
      return typeof action === "string" && ["reply", "post", "quote", "comment", "clarify"].includes(action.trim().toLowerCase());
    });
    if (publicAct && typeof publicAct === "object") {
      const item = publicAct as Record<string, unknown>;
      const value = item.text ?? item.reply ?? item.draft ?? item.content;
      return typeof value === "string" ? value.trim() : "";
    }
    return "";
  }

  const action = typeof parsed.action === "string" ? parsed.action.trim().toLowerCase() : "";
  if (!action || ["no_op", "noop", "none", "silence", "skip"].includes(action)) return "";
  const value = parsed.text ?? parsed.reply ?? parsed.draft ?? parsed.content;
  return typeof value === "string" ? value.trim() : "";
}

/** Explain an internal no-op to the operator without treating it as public speech. */
export function operatorFeedbackText(text: string): string {
  if (/^NO_OP$/i.test(text.trim())) return "No public reply. Genny chose to stay quiet for this turn.";
  if (!publicExpressionLeakageReason(text)) return "";
  const parsed = parsedObject(text);
  const action = typeof parsed?.action === "string"
    ? parsed.action.trim().toLowerCase()
    : /\"action\"\s*:\s*\"([^\"]+)\"/i.exec(text)?.[1]?.trim().toLowerCase();
  if (!action || !["no_op", "noop", "none", "silence", "skip"].includes(action)) return "";
  const rationale = typeof parsed?.rationale === "string" ? parsed.rationale.trim() : looseJsonString(text, "rationale");
  return rationale ? `No public reply. ${rationale}` : "No public reply. Genny chose to stay quiet for this turn.";
}

/**
 * Internal Social Planner metadata is never public expression text. This
 * deliberately recognizes the planner's structured shape instead of banning
 * ordinary prose that happens to use words such as "action" or "rationale".
 */
export function publicExpressionLeakageReason(text?: string): string | undefined {
  if (!text) return undefined;
  const parsed = parsedObject(text);
  const keys = parsed ? Object.keys(parsed).filter((key) => INTERNAL_DECISION_KEYS.has(key)) : [];
  const looseFields = parsed ? [] : Object.keys(loosePlannerFields(text)).filter((key) => INTERNAL_DECISION_KEYS.has(key));
  const hasDisposition = keys.includes("conversationDisposition") || keys.includes("conversation_disposition");
  const hasLooseDisposition = looseFields.includes("conversationDisposition") || looseFields.includes("conversation_disposition");
  const hasDecisionShape = keys.includes("action") || hasDisposition || keys.length >= 2 || looseFields.includes("action") || hasLooseDisposition || looseFields.length >= 2;
  const hasPlannerKeySyntax = /\"(?:action|conversationDisposition|conversation_disposition|rationale|speechAct|recommendedAction)\"\s*:/i.test(text) && /[{}]/.test(text);
  return hasDecisionShape || hasPlannerKeySyntax
    ? "The candidate is an internal Social Planner decision object, not public expression text."
    : undefined;
}
