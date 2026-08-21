import type { OpenPresenceState, ResourceUsageEvent } from "./types";

type UsageWorkspace = Pick<OpenPresenceState, "agent" | "presences" | "resourceUsageEvents">;

/** Attribute Usage events to their Agent owner and deduplicate compatibility snapshots. */
export function canonicalUsageEvents(workspaces: UsageWorkspace[], knownAgentIds = new Set(workspaces.map((workspace) => workspace.agent?.id).filter((id): id is string => Boolean(id)))) {
  const presenceOwners = new Map<string, string>();
  for (const workspace of workspaces) {
    if (!workspace.agent?.id) continue;
    for (const presence of workspace.presences ?? []) presenceOwners.set(presence.id, workspace.agent.id);
  }
  const seen = new Set<string>();
  const eventsByAgent = new Map<string, ResourceUsageEvent[]>();
  for (const workspace of workspaces) {
    for (const event of workspace.resourceUsageEvents ?? []) {
      const ownerId = knownAgentIds.has(event.agentId)
        ? event.agentId
        : event.presenceId ? presenceOwners.get(event.presenceId) ?? workspace.agent?.id : workspace.agent?.id;
      if (!ownerId) continue;
      const eventKey = event.id || `${ownerId}:${event.invocationId}:${event.createdAt}`;
      if (seen.has(eventKey)) continue;
      seen.add(eventKey);
      const ownerEvents = eventsByAgent.get(ownerId);
      if (ownerEvents) ownerEvents.push(event);
      else eventsByAgent.set(ownerId, [event]);
    }
  }
  return eventsByAgent;
}
