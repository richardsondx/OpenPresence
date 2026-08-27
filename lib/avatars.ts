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

export const AVATAR_LOOK_LABELS: Record<AvatarLook, string> = {
  core: "Core",
  professional: "Professional",
  casual: "Casual",
  playful: "Playful",
  pirate: "Pirate",
  scholar: "Scholar",
  operator: "Operator",
};

const avatarAgents = [
  { id: "genny", accent: "#D68754", names: ["genny", "jenny"] },
  { id: "atlas", accent: "#7A8FD8", names: ["atlas"] },
  { id: "drift", accent: "#5B9A75", names: ["drift"] },
  { id: "beacon", accent: "#C96B45", names: ["beacon"] },
] as const;

export function avatarAgentId(accent: string, name = "") {
  const normalizedAccent = accent.toLowerCase();
  const byAccent = avatarAgents.find((agent) => agent.accent.toLowerCase() === normalizedAccent);
  if (byAccent) return byAccent.id;
  const normalizedName = name.trim().toLowerCase();
  return avatarAgents.find((agent) => agent.names.includes(normalizedName as never))?.id ?? "genny";
}

export function avatarAssetPath(accent: string, name: string, look: AvatarLook = "core") {
  return `/avatars/agent-${avatarAgentId(accent, name)}-${look}.png`;
}

/**
 * A Presence look is expressive styling, while the Agent's accent remains the
 * stable identity cue. Older workspaces have no persisted look and therefore
 * intentionally fall back to the unstyled Core character.
 */
export function presenceAvatarLook(presence: Pick<Presence, "avatarLook"> | undefined): AvatarLook {
  return presence?.avatarLook ?? "core";
}

export function defaultAvatarLook(_channel: ChannelId): AvatarLook {
  void _channel;
  return "core";
}
