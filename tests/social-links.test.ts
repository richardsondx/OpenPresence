import { describe, expect, it } from "vitest";
import { externalUrlForMirrorObject } from "../lib/runtime";

describe("Social Mirror external links", () => {
  it("opens a live X object using its canonical status URL", () => {
    expect(externalUrlForMirrorObject({ channelId: "x", externalRef: { type: "x.post", id: "2089060762358595884" } })).toBe("https://x.com/i/status/2089060762358595884");
  });

  it("uses the author handle when the connector provides one", () => {
    expect(externalUrlForMirrorObject({ channelId: "x", externalRef: { type: "x.reply", id: "reply-1" } }, "@gennyverse")).toBe("https://x.com/gennyverse/status/reply-1");
  });

  it("supports provider-native LinkedIn identifiers without affecting X", () => {
    expect(externalUrlForMirrorObject({ channelId: "linkedin", externalRef: { type: "linkedin.post", id: "urn:li:activity:123" } })).toBe("https://www.linkedin.com/feed/update/urn%3Ali%3Aactivity%3A123");
    expect(externalUrlForMirrorObject({ channelId: "linkedin", externalRef: { type: "linkedin.message", id: "message-1" } })).toBeUndefined();
  });

  it("does not invent destinations for Sandbox or unsupported objects", () => {
    expect(externalUrlForMirrorObject({ channelId: "x", externalRef: { type: "x.post", id: "sandbox-1" }, environment: "sandbox" })).toBeUndefined();
    expect(externalUrlForMirrorObject({ channelId: "custom", externalRef: { type: "custom.post", id: "post-1" } })).toBeUndefined();
    expect(externalUrlForMirrorObject({ channelId: "custom", externalRef: { type: "custom.post", id: "https://community.example/posts/1" } })).toBe("https://community.example/posts/1");
  });
});
