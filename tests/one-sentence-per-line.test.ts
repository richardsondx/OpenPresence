import { describe, expect, it } from "vitest";
import { formatOneSentencePerLine, formatPublicExpression, formatReplyText } from "../lib/public-expression";

describe("one-sentence-per-line public formatting", () => {
  it("splits sentence boundaries inside a paragraph", () => {
    expect(formatOneSentencePerLine("First sentence. Second sentence? Third sentence!"))
      .toBe("First sentence.\n\nSecond sentence?\n\nThird sentence!");
  });

  it("keeps closing quotes with their sentence", () => {
    expect(formatOneSentencePerLine("It works. “Really?” Yes."))
      .toBe("It works.\n\n“Really?”\n\nYes.");
  });

  it("does not split decimal numbers or URL punctuation", () => {
    expect(formatOneSentencePerLine("Use v1.2 carefully. Visit https://example.com/a.b now."))
      .toBe("Use v1.2 carefully.\n\nVisit https://example.com/a.b now.");
  });

  it("preserves natural paragraph flow in replies and removes list markers", () => {
    expect(formatReplyText("First sentence. Second sentence.\n\n- **Task success:** finish the job.\n- **Intervention:** avoid repair."))
      .toBe("First sentence. Second sentence.\n\nTask success: finish the job.\n\nIntervention: avoid repair.");
  });

  it("uses conversational flow for replies and quotes while keeping standalone posts crisp", () => {
    const text = "A warm opening. A useful thought.\n\nOne playful closer.";
    expect(formatPublicExpression(text, "x.reply")).toBe(text);
    expect(formatPublicExpression(text, "x.quote")).toBe(text);
    expect(formatPublicExpression(text, "x.post")).toBe("A warm opening.\n\nA useful thought.\n\nOne playful closer.");
  });
});
