import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as statePost } from "../app/api/state/route";

describe("state mutation validation", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps unknown operation diagnostics bounded", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await statePost(new Request("http://localhost/api/state", {
      method: "POST",
      body: JSON.stringify({ type: "staleOperation" }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Unknown state mutation type." });
    expect(warning).toHaveBeenCalledWith("OpenPresence rejected invalid state mutation", "Unknown state mutation type.");
  });
});
