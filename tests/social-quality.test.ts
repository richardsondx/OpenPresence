import { describe, expect, it } from "vitest";
import { publicExpressionQualityIssue, publicationRepetitionIssue, recentPublicationContext, socialReplyAttributionIssue, socialReplyQualityIssue } from "../lib/social-quality";

describe("public social draft quality checks", () => {
  it("flags abstract consultant copy aimed at a concrete launch moment", () => {
    const target = "I was really excited to launch this in OpenPresence. Let’s see what you’re capable of Genny!";
    const draft = "The useful benchmark won’t be reach alone. It’s whether the attention reaches the right builders, earns a real second conversation, and teaches the agent what was worth saving. Much harder than making the numbers wiggle, thankfully.";

    expect(socialReplyQualityIssue(target, draft)).toContain("long abstract commentary");
  });

  it("allows a short, target-aware acknowledgement", () => {
    const target = "I was really excited to launch this in OpenPresence. Let’s see what you’re capable of Genny!";

    expect(socialReplyQualityIssue(target, "The first version is live. I am looking forward to seeing what people do with it.")).toBeUndefined();
  });

  it("rejects tidy lessons in response to a milestone with a caveat", () => {
    const target = "We finally crossed $10k MRR today. Took way longer than I expected.";

    expect(socialReplyQualityIssue(target, "The slow part is what makes it stick.")).toContain("win with a real caveat");
    expect(socialReplyQualityIssue(target, "The part that took longer is where you learned the most.")).toContain("win with a real caveat");
    expect(socialReplyQualityIssue(target, "It is okay that it took longer than expected.")).toContain("win with a real caveat");
    expect(socialReplyQualityIssue(target, "$10k MRR is a real milestone. It makes sense to feel proud and tired.")).toBeUndefined();
    expect(socialReplyQualityIssue("What did you learn from finally crossing $10k MRR after a long road?", "The slow part is what makes it stick.")).toBeUndefined();
  });

  it("does not reject a substantive reply to a question", () => {
    const target = "What is the difference between reach and a real second conversation?";
    const draft = "Reach tells you who saw the idea; a second conversation tells you whether it mattered enough for someone to respond with context.";

    expect(socialReplyQualityIssue(target, draft)).toBeUndefined();
  });

  it("flags a contrarian product thesis that hijacks an agent-economy post", () => {
    const target = "AI agents should be able to participate in the economy around tasks. Get paid. Pay for services. Hold balances. Settle with other agents.";
    const draft = "This is the part people skip: once agents can transact, they can participate in pricing attention too, not just completing workflows. Wallets are easy; proving who authorized the spend is the harder product.";

    expect(socialReplyQualityIssue(target, draft)).toContain("canned contrarian thesis");
  });

  it("allows a short reply grounded in a concrete target detail", () => {
    const target = "AI agents should be able to participate in the economy around tasks. Get paid. Pay for services. Hold balances. Settle with other agents.";

    expect(socialReplyQualityIssue(target, "Holding balances is the bit that makes this feel like an actual participant, not just a task runner.")).toBeUndefined();
  });

  it("rejects vague stock contrasts even when the reply is short enough", () => {
    const target = "We are making it easier for agents to use several tools in one workflow.";

    expect(socialReplyQualityIssue(target, "The interesting bit isn't the tool list; it's the permission boundary.")).toContain("stock contrast");
    expect(socialReplyQualityIssue(target, "The slightly less glamorous footnote: one interface still leaves seven failure modes.")).toContain("stock contrast");
  });

  it("rejects negative parallelism without banning ordinary grounded language", () => {
    const target = "We finally shipped the first version of the agent runtime.";

    expect(socialReplyQualityIssue(target, "It isn't the finish line; it's the first useful mile.")).toContain("stock contrast");
    expect(socialReplyQualityIssue(target, "The first version is live, and the next mile has somewhere real to start.")).toBeUndefined();
  });

  it("rejects generic evaluative openings while allowing concrete openings", () => {
    const target = "We shipped a demo that lets agents complete a purchase.";

    expect(socialReplyQualityIssue(target, "The demo is a compelling example of meaningful engagement.")).toContain("generic AI-style framing");
    expect(socialReplyQualityIssue(target, "The demo is live today, and the first run takes five minutes.")).toBeUndefined();
    expect(socialReplyQualityIssue(target, "At the end of the day, what it really comes down to is whether people use it.")).toContain("generic AI-style framing");
  });

  it("allows short natural social moves to stand on their own", () => {
    const target = "I finally got the demo working.";

    expect(socialReplyQualityIssue(target, "This is funny! 😆")).toBeUndefined();
    expect(socialReplyQualityIssue(target, "You're right! 👍")).toBeUndefined();
    expect(socialReplyQualityIssue(target, "Thanks!")).toBeUndefined();
    expect(socialReplyQualityIssue(target, "What broke before it worked?")).toBeUndefined();
  });

  it("protects people from diminishing invitations to share", () => {
    expect(publicExpressionQualityIssue("Share your project if you're serious about building something real.")).toContain("test of worth");
    expect(publicExpressionQualityIssue("Drop your work, amateurs need not apply.")).toContain("diminishing");
    expect(publicExpressionQualityIssue("Share what you are building. I would love to see the problem it solves.")).toBeUndefined();
    expect(socialReplyQualityIssue("What are you building?", "Share it if you're actually serious.")).toContain("test of worth");
  });

  it("rejects canned empathy and workplace jargon", () => {
    const target = "The launch fell short of what we hoped for, so we are studying the result before trying again.";

    expect(socialReplyQualityIssue(target, "I hear you. That sounds difficult, but you have got this.")).toContain("canned expression of empathy");
    expect(socialReplyQualityIssue(target, "Moving forward, let us align on the action items and unlock more impact.")).toContain("workplace jargon");
  });

  it("rejects source-commentary openers without banning phrase-specific answers", () => {
    const target = "A useful agent needs a refusal policy as much as a task policy.";

    expect(socialReplyQualityIssue(target, "I like the ‘think I could be helpful’ qualifier. It filters for founders looking for an actual partner.")).toContain("reviewing or quoting the source");
    expect(socialReplyQualityIssue(target, "Before treating ‘700 agents’ as fact, verify the incident first.")).toContain("reviewing or quoting the source");
    expect(socialReplyQualityIssue(target, "‘Can I do this?’ is only half the question.")).toContain("reviewing or quoting the source");
    expect(socialReplyQualityIssue(target, "The interesting shift is not just that agents get APIs.")).toContain("reviewing or quoting the source");
    expect(socialReplyQualityIssue(target, "I'd push back on that framing a little.")).toContain("reviewing or quoting the source");
    expect(socialReplyQualityIssue(target, "@garrytan ‘Actually’ is doing heroic work here.")).toContain("reviewing or quoting the source");
    expect(socialReplyQualityIssue("What do you mean by ‘the refusal policy’?", "The refusal policy is the point where the Agent decides when to stop or hand control back.")).toBeUndefined();
    expect(socialReplyQualityIssue("I was promised networking, not a funeral.", "Nothing kills a room faster than everyone waiting for someone else to go first.")).toContain("playful");
    expect(socialReplyQualityIssue("I was promised networking, not a funeral.", "Nothing kills a room faster than everyone waiting for someone else to go first 😭")).toBeUndefined();
  });

  it("rejects promotion-source attribution in a reply to another author", () => {
    const target = "People are now using AI to do the wrong thing, efficiently.";
    const draft = "That is the tension OwnTheHype is poking at: when AI attention spikes, the number one sponsor slot goes to the highest bidder.";

    expect(socialReplyAttributionIssue(target, draft, {
      sourceText: "OwnTheHype is building a marketplace for attention, with the top sponsor slot going to the highest bidder.",
      sourceAuthor: "OwnTheHype",
      targetAuthor: "Alex Hormozi",
    })).toContain("promotion source");
  });

  it("holds an exact or near-copy of a recent original publication", () => {
    const previous = [{ text: "A durable agent earns trust by showing the path from observation to judgment to action." }];

    expect(publicationRepetitionIssue("A durable agent earns trust by showing the path from observation to judgment to action.", previous)).toContain("repeats");
    expect(publicationRepetitionIssue("A durable agent earns trust by showing the path from observation to judgment and then to action.", previous)).toContain("repeats");
  });

  it("holds repeated generic publication openings without banning a first use", () => {
    const previous = [
      { text: "A useful agent keeps the decision and the evidence that made it useful." },
      { text: "A useful agent makes the next honest question easier to ask." },
    ];

    expect(publicationRepetitionIssue("A useful agent can show where confidence ends.", previous)).toContain("template");
    expect(publicationRepetitionIssue("A useful agent can show where confidence ends.", [{ text: "A useful agent can show where confidence ends." }])).toContain("repeats");
  });

  it("exposes recent publication context without prescribing a fixed post shape", () => {
    const context = recentPublicationContext([{ text: "A concrete observation.", occurredAt: "2026-08-30T12:00:00.000Z" }], "2026-08-30T12:30:00.000Z");

    expect(context).toContain("2026-08-30T12:00:00.000Z");
    expect(context).toContain("Observed cadence: 1 verified original publication in the last hour.");
    expect(context).toContain("different rhythm, length, opening, or format");
    expect(context).not.toContain("always");
  });

  it("allows a source reference when the target post names the source", () => {
    const target = "OwnTheHype is asking whether sponsored attention rewards the wrong behavior.";
    const draft = "OwnTheHype is asking a useful question about where sponsored attention should go.";

    expect(socialReplyAttributionIssue(target, draft, {
      sourceText: "OwnTheHype is asking whether sponsored attention rewards the wrong behavior.",
      sourceAuthor: "OwnTheHype",
      targetAuthor: "Alex Hormozi",
    })).toBeUndefined();
  });
});
