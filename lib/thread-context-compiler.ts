import type { Assignment, OperatorConversation, OperatorThread } from "./types";

export interface CompiledThreadContext {
  threadId: string;
  scopeLabel: string;
  messageCount: number;
  assignmentCount: number;
  messages: Array<{ role: OperatorConversation["messages"][number]["role"]; content: string; timestamp: string }>;
  assignments: Array<{ id: string; title: string; status: Assignment["status"]; completion: string }>;
}

/**
 * Compile the smallest useful operator context. This is intentionally a
 * bounded read model: message history and assignment detail are clipped at
 * the boundary instead of leaking an unbounded workspace into cognition.
 */
export function compileThreadContext(
  thread: OperatorThread,
  conversation: OperatorConversation | undefined,
  assignments: Assignment[],
  limits: { maxMessages?: number; maxAssignments?: number; maxCharsPerMessage?: number } = {},
): CompiledThreadContext {
  const maxMessages = Math.max(1, Math.min(100, limits.maxMessages ?? 24));
  const maxAssignments = Math.max(1, Math.min(40, limits.maxAssignments ?? 8));
  const maxCharsPerMessage = Math.max(80, Math.min(4_000, limits.maxCharsPerMessage ?? 1_200));
  const messages = (conversation?.messages ?? []).slice(-maxMessages).map((message) => ({
    role: message.role,
    content: message.content.trim().slice(0, maxCharsPerMessage),
    timestamp: message.timestamp,
  }));
  const linkedIds = new Set(thread.assignmentIds);
  const linkedAssignments = assignments
    .filter((assignment) => linkedIds.has(assignment.id))
    .slice(-maxAssignments)
    .map((assignment) => ({
      id: assignment.id,
      title: assignment.title?.trim() || assignment.instruction.slice(0, 140),
      status: assignment.status,
      completion: `${assignment.progress.verified}/${assignment.progress.required} verified`,
    }));
  const scopeLabel = thread.scope.kind === "agent"
    ? "Agent"
    : thread.scope.kind === "presence"
      ? "Presence"
      : `${thread.scope.presenceIds.length} Presences`;
  return { threadId: thread.id, scopeLabel, messageCount: conversation?.messages.length ?? 0, assignmentCount: linkedIds.size, messages, assignments: linkedAssignments };
}
