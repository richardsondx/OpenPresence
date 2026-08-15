import type { AssetCandidate, AssetSemanticKind, VisualBrief, VisualRole } from "./types";

const formSignals: Array<[AssetSemanticKind, RegExp]> = [
  ["chart", /\b(chart|graph|series|index|rate|yield|spread|flow|heatmap|bar|line|scatter|table)\b/i],
  ["screenshot", /\b(screenshot|screen|dashboard|terminal|odds|quote)\b/i],
  ["photo", /\b(photo|photograph|image of|portrait|event)\b/i],
  ["logo", /\b(logo|wordmark|brand mark|publisher mark)\b/i],
  ["diagram", /\b(diagram|map|flowchart|model|framework)\b/i],
  ["illustration", /\b(illustration|render|artwork|design)\b/i],
  ["meme", /\b(meme|comic)\b/i],
  ["clip", /\b(video|clip|footage)\b/i],
];

function searchableCandidate(candidate: Pick<AssetCandidate, "name" | "title" | "description" | "sourcePageUrl">) {
  return [candidate.name, candidate.title, candidate.description, candidate.sourcePageUrl].filter(Boolean).join(" ").toLowerCase();
}

export function inferAssetSemanticKind(candidate: Pick<AssetCandidate, "name" | "title" | "description" | "sourcePageUrl">): AssetSemanticKind {
  const value = searchableCandidate(candidate);
  return formSignals.find(([, signal]) => signal.test(value))?.[0] ?? "other";
}

function termsOverlap(required: string[] | undefined, value: string) {
  if (!required?.length) return true;
  const normalized = value.toLowerCase();
  return required.some((term) => {
    const words = term.toLowerCase().split(/\s+/).filter((word) => word.length > 2);
    return words.length > 0 && words.every((word) => normalized.includes(word));
  });
}

export interface VisualFitDecision {
  fits: boolean;
  semanticKind: AssetSemanticKind;
  reasons: string[];
}

/**
 * Fit is contextual. The runtime does not reject a form because it is a logo,
 * photo, or report cover in the abstract; it checks whether the candidate can
 * perform the role and show the material requested by this StoryCandidate.
 */
export function assessVisualFit(brief: VisualBrief | undefined, candidate: AssetCandidate): VisualFitDecision {
  const semanticKind = candidate.perception?.visualForm ?? candidate.semanticKind ?? candidate.searchMetadataSemanticHint ?? inferAssetSemanticKind(candidate);
  if (!brief || brief.role === "none") return { fits: true, semanticKind, reasons: ["No visual role was requested."] };
  const value = searchableCandidate(candidate);
  const reasons: string[] = [];
  if (brief.role === "evidence" && !candidate.perception) reasons.push("The downloaded pixels have not been inspected yet; search metadata is only a lead.");
  if (brief.role === "evidence" && candidate.perception?.decorative) reasons.push("The inspected media is decorative and does not perform an evidence role.");
  if (brief.role === "evidence" && candidate.perception?.legibility === "poor") reasons.push("The inspected evidence is not legible enough to support the story.");
  if (brief.avoidForms?.includes(semanticKind)) reasons.push(`The candidate form ${semanticKind} is explicitly outside this visual brief.`);
  if (brief.preferredForms?.length && !brief.preferredForms.includes(semanticKind)) reasons.push(`The candidate form ${semanticKind} does not match the requested visual forms.`);
  if (!termsOverlap(brief.mustShow, value)) reasons.push("The candidate does not expose the requested subject or metric.");
  if (brief.role === "evidence" && semanticKind === "other") reasons.push("The candidate does not provide an interpretable evidence-bearing visual form.");
  if (brief.role === "identity" && !["photo", "screenshot", "illustration", "logo", "meme"].includes(semanticKind)) reasons.push("The candidate does not present the requested identity or scene.");
  return { fits: reasons.length === 0, semanticKind, reasons };
}

export function visualRoleLabel(role: VisualRole) {
  return role === "none" ? "no visual" : role;
}
