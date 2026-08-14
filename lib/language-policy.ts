import type { Agent, LanguagePolicy, Presence } from "./types";

export const EMPTY_LANGUAGE_POLICY: LanguagePolicy = { avoid: [], prohibited: [] };

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
