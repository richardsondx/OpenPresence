import { describe, expect, it } from "vitest";
import { socialReplyQualityIssue } from "../lib/social-quality";

describe("public social draft quality checks", () => {
  it("flags abstract consultant copy aimed at a concrete launch moment", () => {
    const target = "I was really excited to launch this in OpenPresence. Let’s see what you’re capable of Genny!";
    const draft = "The useful benchmark won’t be reach alone. It’s whether the attention reaches the right builders, earns a real second conversation, and teaches the agent what was worth saving. Much harder than making the numbers wiggle, thankfully.";

    expect(socialReplyQualityIssue(target, draft)).toContain("long abstract commentary");
  });

  it("allows a short, target-aware acknowledgement", () => {
    const target = "I was really excited to launch this in OpenPresence. Let’s see what you’re capable of Genny!";

    expect(socialReplyQualityIssue(target, "You’ve got it. I’m excited to put OpenPresence through its paces.")).toBeUndefined();
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
});
