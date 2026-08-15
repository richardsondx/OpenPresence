import { describe, expect, it } from "vitest";
import { assessVisualFit, inferAssetSemanticKind } from "@/lib/visual-fit";
import type { AssetCandidate } from "@/lib/types";

const candidate = (input: Partial<AssetCandidate>): AssetCandidate => ({ id: "candidate", query: "test", name: "candidate", provider: "test", ...input });

describe("contextual visual fit", () => {
  it("accepts an evidence chart when it exposes the requested measure", () => {
    const result = assessVisualFit({ role: "evidence", mustShow: ["crude inventory"], preferredForms: ["chart"] }, candidate({ title: "Crude inventory chart", description: "Weekly crude inventory levels", perception: { observation: "A line chart shows weekly crude inventory levels.", visualForm: "chart", visualRole: "evidence", legibility: "clear", decorative: false, uncertainty: "low" } }));
    expect(result.fits).toBe(true);
    expect(result.semanticKind).toBe("chart");
  });

  it("rejects a reputable page image when it cannot perform the evidence role", () => {
    const result = assessVisualFit({ role: "evidence", mustShow: ["crude inventory"], preferredForms: ["chart"] }, candidate({ title: "Institutional report cover", description: "Annual report cover", sourcePageUrl: "https://example.org/report" }));
    expect(result.fits).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/does not expose|candidate form/);
  });

  it("rejects an uninspected search lead even when its metadata says chart", () => {
    const result = assessVisualFit({ role: "evidence", preferredForms: ["chart"] }, candidate({ title: "Crude inventory chart", description: "Weekly crude inventory levels" }));
    expect(result.fits).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/pixels have not been inspected/);
  });

  it("rejects an inspected decorative image despite a reputable source", () => {
    const result = assessVisualFit({ role: "evidence", preferredForms: ["chart"] }, candidate({ title: "Economic outlook", publisher: "Federal Reserve", perception: { observation: "A decorative office photograph.", visualForm: "photo", visualRole: "context", decorative: true, legibility: "clear", uncertainty: "low" } }));
    expect(result.fits).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/decorative|candidate form/);
  });

  it("does not universalize chart preference across other visual roles", () => {
    const photo = candidate({ title: "Photograph of the launch event", description: "A crowd outside the venue" });
    expect(inferAssetSemanticKind(photo)).toBe("photo");
    expect(assessVisualFit({ role: "identity", preferredForms: ["photo"] }, photo).fits).toBe(true);
    expect(assessVisualFit({ role: "evidence", preferredForms: ["chart"] }, photo).fits).toBe(false);
  });

  it("allows a logo when the Presence intentionally wants identity material", () => {
    const logo = candidate({ title: "New brand wordmark", description: "Logo and identity mark" });
    expect(inferAssetSemanticKind(logo)).toBe("logo");
    expect(assessVisualFit({ role: "identity", preferredForms: ["logo"] }, logo).fits).toBe(true);
  });

  it("accepts text-only planning when no visual role is requested", () => {
    expect(assessVisualFit({ role: "none" }, candidate({ title: "Unrelated report cover" })).fits).toBe(true);
  });
});
