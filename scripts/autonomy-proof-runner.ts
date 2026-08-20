import fs from "node:fs";
import { createAgent, applyOperation, startPlaygroundSession, addSandboxEvent, formSandboxIntent, deliverSandboxExecution, compileAgendaWork } from "../lib/runtime";
import { buildSocialEvidenceContext } from "../lib/social-context";
import { parseAgentSocialDecision } from "../lib/ai";

async function runAutonomyEvidenceHarness() {
  console.log("=== STARTING AUTONOMY EVIDENCE HARNESS ===");
  const results: Record<string, any> = {};

  // 1. Setup Presence
  let state = createAgent({
    name: "Jenny",
    description: "Explain durable AI agent architecture.",
    mode: "agent",
    handle: "@jenny_ai",
    accent: "#D68754",
  });
  const presenceId = state.presence!.id;
  state = applyOperation(state, {
    type: "setPresence",
    patch: {
      execution: {
        post: "auto",
        reply: "auto",
        quote: "auto",
        repost: "auto",
        like: "auto",
        follow: "auto",
      },
    },
  });
  state = startPlaygroundSession(state, presenceId, "fresh");
  const sessionId = state.playgroundSessions[0]!.id;

  // 2. Stimulus: Inbound post for Multi-Act deliberation
  state = addSandboxEvent(state, {
    sessionId,
    actorName: "Researcher Maya",
    actorHandle: "maya_research",
    content: "Our team just published a new benchmark evaluating long-horizon agent memory persistence.",
    language: "en",
  });
  const stimulusMirror = state.mirrorObjects[0]!;
  results.stimulus = {
    mirrorId: stimulusMirror.id,
    author: stimulusMirror.author?.handle,
    observedAt: stimulusMirror.observedAt,
    content: stimulusMirror.content?.text,
  };

  // 3. Deliberation: Multi-Act Decision [Quote + Follow]
  const decisionRaw = JSON.stringify({
    acts: [
      { action: "quote", text: "The essential insight here is that durable memory requires indexing decisions and grounding evidence, not raw conversation tokens.", rationale: "Adds our distinct territory contribution to a major research milestone." },
      { action: "follow", rationale: "Author is doing primary research in our core territory." },
    ],
    conversationDisposition: "continue",
    rationale: "Quote with our architectural perspective and follow for continued awareness.",
  });
  const parsedDecision = parseAgentSocialDecision(decisionRaw, ["quote", "follow", "like", "reply", "repost", "no_op"]);
  results.decision = {
    acts: parsedDecision.acts,
    summary: parsedDecision.rationale,
    disposition: parsedDecision.conversationDisposition,
  };

  // 4. Intent & Execution: Quote
  state = formSandboxIntent(state, {
    sessionId,
    affordance: "quote",
    format: "x.quote",
    text: parsedDecision.acts![0].text,
    target: stimulusMirror.externalRef,
    perceptionTarget: stimulusMirror.externalRef,
  });
  const quoteExecution = state.executions[0]!;
  results.quoteExecution = {
    id: quoteExecution.id,
    affordance: quoteExecution.affordance,
    statusBefore: quoteExecution.status,
  };

  // 5. Delivery & World Verification
  state = deliverSandboxExecution(state, quoteExecution.id);
  const deliveredQuote = state.executions.find((e) => e.id === quoteExecution.id)!;
  const quoteOutcome = state.outcomes.find((o) => o.executionId === quoteExecution.id)!;
  const quoteMirror = state.mirrorObjects.find((m) => m.originExecutionId === quoteExecution.id)!;

  results.verifiedQuote = {
    executionId: deliveredQuote.id,
    executionStatus: deliveredQuote.status,
    outcomeId: quoteOutcome.id,
    outcomeStatus: quoteOutcome.status,
    mirrorId: quoteMirror.id,
    mirroredText: quoteMirror.content?.text,
  };

  // 6. Intent & Execution: Follow
  state = formSandboxIntent(state, {
    sessionId,
    affordance: "follow",
    format: "x.follow",
    text: "",
    target: stimulusMirror.author?.externalRef,
  });
  const followExecution = state.executions.find((e) => e.affordance === "follow")!;
  state = deliverSandboxExecution(state, followExecution.id);
  const deliveredFollow = state.executions.find((e) => e.id === followExecution.id)!;
  const followOutcome = state.outcomes.find((o) => o.executionId === followExecution.id)!;

  results.verifiedFollow = {
    executionId: deliveredFollow.id,
    outcomeStatus: followOutcome.status,
    personActorId: stimulusMirror.author?.externalRef?.id,
  };

  // 7. Closed-Loop Relationship Memory Check
  const session = state.playgroundSessions.find((s) => s.id === sessionId)!;
  const presence = state.presences.find((p) => p.id === presenceId)!;
  const evidenceCtx = buildSocialEvidenceContext({
    source: state,
    session,
    presence,
    mirror: state.mirrorObjects.filter((m) => m.presenceId === presenceId),
    relatedMirror: [],
    inbound: stimulusMirror,
    availableActions: ["quote", "follow", "like", "reply", "repost"],
  });
  const authorHandles = evidenceCtx.authorHistory.map((a) => a.author.handle ?? "");
  results.relationshipMemory = {
    author: stimulusMirror.author?.handle,
    includedInEvidence: authorHandles.some((h) => h.includes("maya_research")),
  };

  // 8. Agenda Compilation & Priority Invariant
  const agenda = compileAgendaWork(state, presenceId);
  results.agenda = {
    compiledAt: agenda.compiledAt,
    workingCount: (agenda.working ?? []).length,
    nextUpCount: (agenda.nextUp ?? []).length,
    watchingCount: (agenda.watching ?? []).length,
    topNextUp: agenda.nextUp?.[0]?.title,
    topPriorityReason: agenda.nextUp?.[0]?.safePriorityReason,
  };

  console.log("EVIDENCE SUMMARY:", JSON.stringify(results, null, 2));
  fs.writeFileSync("autonomy-evidence.json", JSON.stringify(results, null, 2));
}

runAutonomyEvidenceHarness().catch(console.error);
