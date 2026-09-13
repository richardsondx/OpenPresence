/** Bound a newest-first or oldest-first ledger by recency, never array tail.
 * Conversations are prepended, while messages within them are appended. */
export function recentChatItems<T>(items: T[] | undefined, presenceId: string | undefined, limit: number): T[] {
  const date = (item: T) => {
    const value = item as { updatedAt?: string; createdAt?: string; timestamp?: string; occurredAt?: string };
    return Date.parse(value.updatedAt ?? value.createdAt ?? value.timestamp ?? value.occurredAt ?? "") || 0;
  };
  return (items ?? [])
    .filter((item) => !presenceId || (item as { presenceId?: string }).presenceId === undefined || (item as { presenceId?: string }).presenceId === presenceId)
    .sort((left, right) => date(right) - date(left))
    .slice(0, limit);
}

/** A queued follow-up may be saved before the previous answer arrives.
 * Preserve turn order for both rendering and model context, even though the
 * durable event ledger is chronological. Unlinked legacy messages stay put. */
export function orderedOperatorChatMessages<T extends { id: string; role: string; replyToMessageId?: string }>(messages: T[]): T[] {
  const operatorIds = new Set(messages.filter((item) => item.role === "operator").map((item) => item.id));
  const replies = new Map<string, T[]>();
  for (const item of messages) {
    if (item.role !== "operator" && item.replyToMessageId && operatorIds.has(item.replyToMessageId)) {
      replies.set(item.replyToMessageId, [...(replies.get(item.replyToMessageId) ?? []), item]);
    }
  }
  return messages.flatMap((item) => {
    if (item.role !== "operator" && item.replyToMessageId && operatorIds.has(item.replyToMessageId)) return [];
    return [item, ...(replies.get(item.id) ?? [])];
  });
}
