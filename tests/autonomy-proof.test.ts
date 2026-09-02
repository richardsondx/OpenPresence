import { describe, expect, it } from "vitest";
import { createAgent, applyOperation, startPlaygroundSession, addSandboxEvent, formSandboxIntent, deliverSandboxExecution, compileAgendaWork } from "../lib/runtime";
import { parseAgentSocialDecision } from "../lib/ai";

describe("Empirical Autonomy Evidence Harness", () => {
  it("executes end-to-end closed loop and extracts durable trace records", async () => {
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

    // 3. Deliberation: Multi-Act Decision [Quote + Repost + Follow]
    const decisionRaw = JSON.stringify({
      acts: [
        { action: "quote", text: "The essential insight here is that durable memory requires indexing decisions and grounding evidence, not raw conversation tokens.", rationale: "Adds our distinct territory contribution to a major research milestone." },
        { action: "repost", rationale: "The benchmark announcement is independently useful to our audience as-is." },
        { action: "follow", rationale: "Author is doing primary research in our core territory." },
      ],
      rationale: "Quote with our architectural perspective and follow for continued awareness.",
    });
    const parsedDecision = parseAgentSocialDecision(decisionRaw, ["quote", "follow", "like", "reply", "repost"]);
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
    const deliveredQuote = state.executions.find(e => e.id === quoteExecution.id)!;
    const quoteOutcome = state.outcomes.find(o => o.executionId === quoteExecution.id)!;
    const quoteMirror = state.mirrorObjects.find(m => m.originExecutionId === quoteExecution.id)!;

    results.verifiedQuote = {
      executionId: deliveredQuote.id,
      executionStatus: deliveredQuote.status,
      outcomeId: quoteOutcome.id,
      outcomeStatus: quoteOutcome.status,
      mirrorId: quoteMirror.id,
      mirroredText: quoteMirror.content?.text,
    };

    // 6. Intent & Execution: Repost
    state = formSandboxIntent(state, {
      sessionId,
      affordance: "repost",
      format: "x.repost",
      text: "",
      target: stimulusMirror.externalRef,
      perceptionTarget: stimulusMirror.externalRef,
    });
    const repostExecution = state.executions.find(e => e.affordance === "repost")!;
    state = deliverSandboxExecution(state, repostExecution.id);
    const deliveredRepost = state.executions.find(e => e.id === repostExecution.id)!;
    const repostOutcome = state.outcomes.find(o => o.executionId === repostExecution.id)!;
    results.verifiedRepost = {
      executionId: deliveredRepost.id,
      executionStatus: deliveredRepost.status,
      outcomeStatus: repostOutcome.status,
    };

    // 7. Intent & Execution: Follow
    state = formSandboxIntent(state, {
      sessionId,
      affordance: "follow",
      format: "x.follow",
      target: stimulusMirror.author?.externalRef,
    });
    const followExecution = state.executions.find(e => e.affordance === "follow")!;
    state = deliverSandboxExecution(state, followExecution.id);
    const deliveredFollow = state.executions.find(e => e.id === followExecution.id)!;
    const followOutcome = state.outcomes.find(o => o.executionId === followExecution.id)!;

    results.verifiedFollow = {
      executionId: deliveredFollow.id,
      outcomeStatus: followOutcome.status,
      personActorId: stimulusMirror.author?.externalRef?.id,
    };

    // 8. Closed-Loop Relationship Memory Check
    const personIdentity = state.personIdentities.find(
      (p) => p.externalActorId === stimulusMirror.author?.externalRef?.id && p.sourcePresenceId === presenceId
    );
    const isFollowed = state.executions.some(
      (e) => e.presenceId === presenceId && e.affordance === "follow" && e.status === "succeeded"
    );
    results.relationshipMemory = {
      author: stimulusMirror.author?.handle,
      personIdentityRecorded: Boolean(personIdentity),
      followingVerified: isFollowed,
    };

    // 9. Agenda Compilation & Priority Invariant
    const agenda = compileAgendaWork(state, presenceId);
    results.agenda = {
      compiledAt: agenda.compiledAt,
      workingCount: (agenda.working ?? []).length,
      nextUpCount: (agenda.nextUp ?? []).length,
      watchingCount: (agenda.watching ?? []).length,
      topNextUp: agenda.nextUp?.[0]?.title,
      topPriorityReason: agenda.nextUp?.[0]?.safePriorityReason,
    };

    console.log("=== EMPIRICAL AUTONOMY EVIDENCE ===");
    console.log(JSON.stringify(results, null, 2));

    expect(deliveredQuote.status).toBe("succeeded");
    expect(quoteOutcome.status).toBe("succeeded");
    expect(deliveredRepost.status).toBe("succeeded");
    expect(repostOutcome.status).toBe("succeeded");
    expect(deliveredFollow.status).toBe("succeeded");
    expect(results.relationshipMemory.followingVerified).toBe(true);
    expect(results.relationshipMemory.personIdentityRecorded).toBe(true);
    expect(state.relationships.find((relationship) => relationship.personId === personIdentity?.personId)?.following).toBe(true);

    // CRITICAL INVARIANT: Standalone post + Quote + Follow MUST NOT create a ConversationEpisode or Conversation Agenda work
    expect(state.conversationEpisodes.length).toBe(0);
    expect(agenda.nextUp?.some((item) => item.title.includes("Continue conversation"))).toBe(false);
  });
});
