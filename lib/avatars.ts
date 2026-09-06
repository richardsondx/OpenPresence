import type { ChannelId, Presence } from "./types";

export const AVATAR_LOOKS = [
  "core",
  "professional",
  "casual",
  "playful",
  "pirate",
  "scholar",
  "operator",
] as const;

export type AvatarLook = (typeof AVATAR_LOOKS)[number];

export const AGENT_AVATAR_VARIANTS = [
  { id: "genny", label: "Orbit", description: "Warm, curious, and ready to go.", accent: "#D68754", asset: "/avatars/ghost-genny-simple.png" },
  { id: "atlas", label: "Comet", description: "Quietly bright with a little drift.", accent: "#7A8FD8", asset: "/avatars/ghost-atlas-simple.png" },
  { id: "drift", label: "Cloud", description: "Soft edges for thoughtful work.", accent: "#5B9A75", asset: "/avatars/ghost-drift-simple.png" },
  { id: "beacon", label: "Beacon", description: "A sharp signal with a playful point.", accent: "#C96B45", asset: "/avatars/ghost-beacon-simple.png" },
] as const;

export type AgentAvatarVariant = (typeof AGENT_AVATAR_VARIANTS)[number]["id"];

export const AVATAR_LOOK_LABELS: Record<AvatarLook, string> = {
  core: "Core",
  professional: "Professional",
  casual: "Casual",
  playful: "Playful",
  pirate: "Pirate",
  scholar: "Scholar",
  operator: "Operator",
};

const simpleAvatarAssets: Record<AgentAvatarVariant, string> = Object.fromEntries(
  AGENT_AVATAR_VARIANTS.map((variant) => [variant.id, variant.asset]),
) as Record<AgentAvatarVariant, string>;

const avatarAgents = [
  { id: "genny", accent: "#D68754", names: ["genny", "jenny"] },
  { id: "atlas", accent: "#7A8FD8", names: ["atlas"] },
  { id: "drift", accent: "#5B9A75", names: ["drift"] },
  { id: "beacon", accent: "#C96B45", names: ["beacon"] },
] as const;

function stableAvatarIndex(value: string) {
  return [...value].reduce((hash, character) => ((hash * 31 + character.charCodeAt(0)) >>> 0), 7) % avatarAgents.length;
}

export function avatarAgentId(accent: string, name = "") {
  const normalizedAccent = accent.toLowerCase();
  const byAccent = avatarAgents.find((agent) => agent.accent.toLowerCase() === normalizedAccent);
  if (byAccent) return byAccent.id;
  const normalizedName = name.trim().toLowerCase();
  return avatarAgents.find((agent) => agent.names.includes(normalizedName as never))?.id
    ?? avatarAgents[stableAvatarIndex(`${normalizedName}|${normalizedAccent}`)].id;
}

export function defaultAvatarVariant(accent: string, name = ""): AgentAvatarVariant {
  return avatarAgentId(accent, name);
}

export function avatarAssetPath(accent: string, name: string, _look: AvatarLook = "core", avatarVariant?: AgentAvatarVariant) {
  // `avatarLook` remains part of the persisted Presence shape for older
  // workspaces, but Agent identity is now one stable, simple mark everywhere.
  void _look;
  return simpleAvatarAssets[avatarVariant ?? defaultAvatarVariant(accent, name)] ?? simpleAvatarAssets.genny;
}

/**
 * Legacy Presence look data is still readable so old workspaces can hydrate,
 * while the visual identity is owned by the Agent and does not vary by
 * Presence or channel.
 */
export function presenceAvatarLook(presence: Pick<Presence, "avatarLook"> | undefined): AvatarLook {
  return presence?.avatarLook ?? "core";
}

export function defaultAvatarLook(_channel: ChannelId): AvatarLook {
  void _channel;
  return "core";
}
