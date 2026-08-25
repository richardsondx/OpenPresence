import type { Agent, LanguagePolicy, Presence, PresenceLanguage } from "./types";

export const EMPTY_LANGUAGE_POLICY: LanguagePolicy = { avoid: [], prohibited: [] };
export const DEFAULT_PRESENCE_LANGUAGE: PresenceLanguage = "en";

function languageBase(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLocaleLowerCase().replaceAll("_", "-");
  if (!normalized || normalized === "unknown" || normalized === "und") return undefined;
  const base = normalized.split("-")[0];
  return base === "eng" ? "en" : base;
}

export function languagesMatch(expected: unknown, observed: unknown): boolean {
  const expectedBase = languageBase(expected);
  const observedBase = languageBase(observed);
  return Boolean(expectedBase && observedBase && expectedBase === observedBase);
}

function meaningfulLanguageText(text: string | undefined): string {
  return (text ?? "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[@#][\p{L}\p{N}_-]+/gu, "")
    .replace(/[\p{P}\p{S}\p{N}_\s]/gu, "")
    .trim();
}

/**
 * X uses `zxx` for posts with no linguistic content, commonly image-only
 * posts. Its `qme` label is also used for mention/link-only post shells. A
 * provider label alone is not enough to admit a target: the observed text
 * must actually contain no language-bearing content.
 */
export function languageEligibleForObservation(expected: unknown, observed: unknown, text?: string, hasVisualAsset = false): boolean {
  if (languagesMatch(expected, observed)) return true;
  if (languageBase(expected) !== "en" || typeof observed !== "string") return false;
  const raw = observed.trim().toLocaleLowerCase().replaceAll("_", "-");
  if (!raw || !["zxx", "und", "qme"].includes(raw)) return false;
  // qme describes a non-linguistic/link-only shell even when X does not
  // provide a media attachment. Keep zxx/und conservative for general feeds.
  return meaningfulLanguageText(text).length === 0 && (raw === "qme" || hasVisualAsset);
}

export function normalizedObservedLanguage(value: unknown): string | undefined {
  return languageBase(value);
}

export function normalizePresenceLanguage(value: unknown): PresenceLanguage {
  return value === "en" ? "en" : DEFAULT_PRESENCE_LANGUAGE;
}

export function presenceLanguageGuidance(value: unknown): string {
  const language = normalizePresenceLanguage(value);
  if (language === "en") {
    return "Primary Presence language: English (en). Admit only confirmed-English social observations into the Feed and Agent context. Write all Agent-authored posts, replies, messages, and private Presence Chat responses in English. Do not switch languages to match an inbound post. Non-English or unconfirmed-language world content is excluded rather than guessed or translated.";
  }
  return `Primary Presence language: ${language}. Write all Agent-authored expression in this language.`;
}

function cleanList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.normalize("NFKC").replace(/\r\n?/g, "\n").replace(/\s+/gu, " ").trim())
    .filter((value) => value.length > 0)
    .filter((value) => {
      const key = value.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function normalizeLanguagePolicy(value: unknown): LanguagePolicy {
  const policy = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return { avoid: cleanList(policy.avoid), prohibited: cleanList(policy.prohibited) };
}

export function mergeLanguagePolicies(agent?: LanguagePolicy, presence?: LanguagePolicy): LanguagePolicy {
  const first = normalizeLanguagePolicy(agent);
  const second = normalizeLanguagePolicy(presence);
  return normalizeLanguagePolicy({ avoid: [...first.avoid, ...second.avoid], prohibited: [...first.prohibited, ...second.prohibited] });
}

export function effectiveLanguagePolicy(agent: Agent | null | undefined, presence?: Presence | null): LanguagePolicy {
  return mergeLanguagePolicies(agent?.languagePolicy, presence?.languagePolicy);
}

function normalizedText(value: string) {
  return value.normalize("NFKC").replace(/\r\n?/g, "\n").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}

function isWordCharacter(value: string | undefined) {
  return Boolean(value && /[\p{L}\p{N}_]/u.test(value));
}

export function containsLiteral(text: string, literal: string): boolean {
  const haystack = normalizedText(text);
  const needle = normalizedText(literal);
  if (!haystack || !needle) return false;
  let offset = haystack.indexOf(needle);
  while (offset >= 0) {
    const before = haystack[offset - 1];
    const after = haystack[offset + needle.length];
    const needsBoundary = isWordCharacter(needle[0]) || isWordCharacter(needle[needle.length - 1]);
    if (!needsBoundary || (!isWordCharacter(before) && !isWordCharacter(after))) return true;
    offset = haystack.indexOf(needle, offset + 1);
  }
  return false;
}

export interface LanguageViolation { literal: string; kind: "prohibited"; }
export interface LanguageValidationResult { valid: boolean; violations: LanguageViolation[]; avoided: string[]; }

export function validateLanguage(text: string, policy: LanguagePolicy): LanguageValidationResult {
  const normalized = normalizeLanguagePolicy(policy);
  const violations = normalized.prohibited.filter((literal) => containsLiteral(text, literal)).map((literal) => ({ literal, kind: "prohibited" as const }));
  const avoided = normalized.avoid.filter((literal) => containsLiteral(text, literal));
  return { valid: violations.length === 0, violations, avoided };
}

export function languagePolicyGuidance(policy: LanguagePolicy): string {
  const normalized = normalizeLanguagePolicy(policy);
  return [
    normalized.avoid.length ? "Advisory language preferences (use judgment; they never block delivery): " + JSON.stringify(normalized.avoid) : "",
    normalized.prohibited.length ? "Hard lexical constraints (do not use these literal terms or phrases): " + JSON.stringify(normalized.prohibited) : "",
    "These are literal matching rules, not semantic categories. Preserve the social act, target, thread, facts, assets, and format if you revise a draft.",
  ].filter(Boolean).join("\n");
}
