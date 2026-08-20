import { NextResponse } from "next/server";
import { z } from "zod";
import { readState, writeState } from "@/lib/db";
import { compileKnowledgeContext, readKnowledge } from "@/lib/knowledge";
import { stateForContext } from "@/lib/runtime";

const requestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("search"), query: z.string().trim().min(1).max(1000), purpose: z.string().trim().max(80).optional(), limit: z.number().int().min(1).max(12).optional() }),
  z.object({ mode: z.literal("read"), segmentId: z.string().min(1), purpose: z.string().trim().max(80).optional() }),
]);

function context(request: Request) {
  return {
    agentId: request.headers.get("x-openpresence-agent-id")?.trim() || undefined,
    presenceId: request.headers.get("x-openpresence-presence-id")?.trim() || undefined,
  };
}

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const state = stateForContext(readState(), context(request));
    const presenceId = state.presence?.id;
    if (!state.agent?.id || !presenceId) throw new Error("Knowledge tools require an active Agent and Presence.");
    if (input.mode === "search") {
      const compiled = compileKnowledgeContext(state, { presenceId, query: input.query, purpose: input.purpose ?? "operator_chat", limit: input.limit });
      writeState(compiled.state);
      const run = compiled.state.knowledgeRetrievalRuns.find((item) => item.id === compiled.packet.retrievalRunId);
      return NextResponse.json({ packet: compiled.packet, result: { retrievalRunId: compiled.packet.retrievalRunId, results: [...compiled.packet.publicEvidence, ...compiled.packet.restrictedEvidence], knowledgeAccess: run?.knowledgeAccess ?? "none", accessibleDocumentIds: run?.accessibleDocumentIds ?? [], accessibleCollectionIds: run?.accessibleCollectionIds ?? [], missingEvidence: compiled.packet.missingEvidence, unresolvedConflicts: compiled.packet.unresolvedConflicts, staleWarnings: compiled.packet.staleWarnings }, state: compiled.state });
    }
    const read = readKnowledge(state, { presenceId, segmentId: input.segmentId, purpose: input.purpose ?? "operator_chat" });
    writeState(read.state);
    return NextResponse.json({ retrievalRunId: read.retrievalRunId, evidence: read.evidence, state: read.state });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Knowledge retrieval failed." }, { status: 400 });
  }
}
