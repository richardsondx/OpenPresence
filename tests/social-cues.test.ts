import { describe, expect, it } from "vitest";
import { classifySocialCue, socialCueInstruction } from "../lib/social-cues";

describe("social cue perception", () => {
  it("recognizes playful Boardy-style banter as lightweight", () => {
    const cue = classifySocialCue("11/10 is generous, but overtime connections are kinda my cardio", "Jenny", "@jenny_ai");
    expect(cue.tone).toBe("playful");
    expect(cue.lightweight).toBe(true);
    expect(cue.speechAct).toBe("compliment");
  });

  it("recognizes a direct rating invitation as a response-worthy social act", () => {
    const cue = classifySocialCue("I've rated your companies out of 10 before. Rate mine (be honest).", "Jenny", "@jenny_ai");
    expect(cue.speechAct).toBe("rating-request");
    expect(cue.asksForResponse).toBe(true);
    expect(cue.lightweight).toBe(true);
  });

  it("recognizes a natural endpoint without forcing a last word", () => {
    const cue = classifySocialCue("Exactly.", "Jenny", "@jenny_ai");
    expect(cue.speechAct).toBe("acknowledgment");
    expect(cue.naturalEndpoint).toBe(true);
    expect(cue.asksForResponse).toBe(false);
  });

  it("separates sensitive technical evidence from generic topical text", () => {
    const cue = classifySocialCue("The chart's denominator changed, so the benchmark headline is not the result.", "Jenny", "@jenny_ai");
    expect(cue.tone).toBe("technical");
    expect(cue.speechAct).toBe("technical-claim");
    expect(cue.lightweight).toBe(false);
  });

  it("names the direct-address and service cues in model guidance", () => {
    const cue = classifySocialCue("@jenny_ai can you connect me with a veteran near Detroit who does security?", "Jenny", "@jenny_ai");
    const guidance = socialCueInstruction(cue);
    expect(cue.speechAct).toBe("service-request");
    expect(cue.directAddress).toBe(true);
    expect(guidance).toContain("search or state the smallest truthful limitation");
  });

  it("does not literalize common sarcastic phrasing", () => {
    const cue = classifySocialCue("Oh great, another three-hour meeting. Exactly what I needed.", "Jenny", "@jenny_ai");
    expect(cue.tone).toBe("sarcastic");
    expect(cue.cues).toContain("may be sarcastic or exaggerated");
  });
});
