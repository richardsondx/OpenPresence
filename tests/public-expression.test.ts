import { describe, expect, it } from "vitest";
import { operatorFeedbackText, publicExpressionLeakageReason, publicExpressionText } from "../lib/public-expression";

describe("public Presence expression boundary", () => {
  it("extracts only public wording from a structured reply decision", () => {
    const plannerReply = JSON.stringify({
      conversationDisposition: "close_with_reply",
      action: "reply",
      text: "I’d measure successful task completion without intervention.",
      rationale: "A concrete reliability metric is more useful than engagement.",
    });

    expect(publicExpressionLeakageReason(plannerReply)).toBeTruthy();
    expect(publicExpressionText(plannerReply)).toBe("I’d measure successful task completion without intervention.");
  });

  it("recovers public wording when a provider puts literal newlines inside JSON", () => {
    const plannerReply = '{"conversationDisposition":"close_with_reply","action":"reply","text":"First sentence.\n\nSecond sentence."}';
    expect(publicExpressionText(plannerReply)).toBe("First sentence.\n\nSecond sentence.");
  });

  it("removes silent decisions instead of rendering internal metadata", () => {
    const noOp = '{"conversationDisposition":"close_silently","action":"no_op","rationale":"The statement is complete and does not open a useful exchange."}';
    expect(publicExpressionText(noOp)).toBe("");
    expect(operatorFeedbackText(noOp)).toBe("No public reply. The statement is complete and does not open a useful exchange.");
    expect(publicExpressionText("NO_OP")).toBe("");
    expect(operatorFeedbackText("NO_OP")).toBe("No public reply. Genny chose to stay quiet for this turn.");
  });

  it("leaves ordinary prose unchanged", () => {
    expect(publicExpressionText("The useful test is whether the memory changes the next decision.")).toBe("The useful test is whether the memory changes the next decision.");
  });

  it("extracts the first public act from a bundled decision", () => {
    const bundled = JSON.stringify({
      acts: [
        { action: "like", rationale: "A quiet signal is enough." },
        { action: "reply", text: "The denominator is the story." },
      ],
      rationale: "Keep the response bounded.",
    });

    expect(publicExpressionText(bundled)).toBe("The denominator is the story.");
  });
});
