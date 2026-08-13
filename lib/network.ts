import type { SandboxActor, SandboxNetworkCandidate } from "./types";

export type NetworkSearchStatus = "matches" | "no-match" | "insufficient-evidence";

export type NetworkCandidate = SandboxNetworkCandidate;

export interface NetworkSearchResult {
  query: string;
  status: NetworkSearchStatus;
  candidates: NetworkCandidate[];
  limitation?: string;
}

const STOP_WORDS = new Set(["a", "an", "and", "any", "are", "be", "can", "do", "does", "for", "from", "help", "i", "in", "is", "me", "near", "of", "or", "person", "people", "someone", "that", "the", "to", "who", "with"]);

function tokens(value: string) {
  return [...new Set(value.toLowerCase().match(/[a-z0-9]+/g)?.filter((token) => token.length > 2 && !STOP_WORDS.has(token)) ?? [])];
}

function profileText(actor: SandboxActor) {
  const profile = actor.profile;
  return [
    actor.displayName,
    actor.handle,
    profile?.bio,
    profile?.location,
    ...(profile?.roles ?? []),
    ...(profile?.skills ?? []),
  ].filter(Boolean).join(" ");
}

function evidenceFor(actor: SandboxActor, queryTokens: string[]) {
  const profile = actor.profile;
  const fields: Array<[string, string | undefined]> = [
    ["bio", profile?.bio],
    ["location", profile?.location],
    ["role", profile?.roles?.join(", ")],
    ["skill", profile?.skills?.join(", ")],
  ];
  return fields.flatMap(([label, value]) => {
    if (!value) return [];
    const overlap = queryTokens.filter((token) => tokens(value).includes(token));
    return overlap.length ? [`${label}: ${value}`] : [];
  });
}

export function searchSandboxNetwork(actors: SandboxActor[], sessionId: string, query: string): NetworkSearchResult {
  const cleanQuery = query.trim();
  const queryTokens = tokens(cleanQuery);
  if (queryTokens.length < 1) {
    return { query: cleanQuery, status: "insufficient-evidence", candidates: [], limitation: "The request does not contain enough searchable detail." };
  }

  const candidates = actors
    .filter((actor) => actor.sessionId === sessionId && actor.profile)
    .map((actor) => {
      const evidence = evidenceFor(actor, queryTokens);
      const searchable = tokens(profileText(actor));
      const score = queryTokens.filter((token) => searchable.includes(token)).length;
      return { actor, evidence, score };
    })
    .filter((item) => item.score >= Math.min(2, queryTokens.length) && item.evidence.length > 0)
    .sort((left, right) => right.score - left.score || left.actor.displayName.localeCompare(right.actor.displayName))
    .slice(0, 5)
    .map(({ actor, evidence, score }) => ({
      actorId: actor.id,
      displayName: actor.displayName,
      handle: actor.handle,
      permission: actor.profile?.introductionPermission ?? "ask-first",
      evidence,
      score,
    }));

  if (!candidates.length) {
    return { query: cleanQuery, status: "no-match", candidates: [], limitation: "No verified sandbox profile matches the request. Do not imply that a person was found or contacted." };
  }
  return { query: cleanQuery, status: "matches", candidates };
}

export function networkSearchInstruction(result: NetworkSearchResult) {
  if (result.status === "insufficient-evidence") return `Network search: insufficient evidence. ${result.limitation}`;
  if (result.status === "no-match") return `Network search: no verified match for “${result.query}”. ${result.limitation}`;
  const matches = result.candidates.map((candidate) => {
    const permission = candidate.permission === "allowed" ? "introduction allowed" : candidate.permission === "ask-first" ? "ask before introducing" : "introduction not available";
    return `${candidate.displayName}${candidate.handle ? ` (${candidate.handle})` : ""}; ${permission}; ${candidate.evidence.join("; ")}`;
  }).join("\n- ");
  return `Network search: verified sandbox matches for “${result.query}”:\n- ${matches}\nOnly name candidates whose evidence is shown. Respect each permission state. Never claim an introduction occurred unless a separate execution confirms it.`;
}
