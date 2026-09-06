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
