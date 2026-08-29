import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runOperationalSweep: vi.fn(() => ({
    reclaimedLeases: 2,
    staleRunsDetected: [{ id: "stale-run" }],
    dispatchedWakes: [{ id: "wake" }],
    timestamp: "2026-08-29T17:00:00.000Z",
  })),
  recordProcessHeartbeat: vi.fn(),
}));

vi.mock("@/lib/temporal", () => ({ runOperationalSweep: mocks.runOperationalSweep }));
vi.mock("@/lib/db", () => ({ recordProcessHeartbeat: mocks.recordProcessHeartbeat }));

import { POST } from "@/app/api/runtime/sweep/route";

describe("runtime scheduler sweep route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mocks.runOperationalSweep.mockClear();
    mocks.recordProcessHeartbeat.mockClear();
  });

  it("rejects requests without the launcher token", async () => {
    vi.stubEnv("OPENPRESENCE_SCHEDULER_TOKEN", "scheduler-secret");
    const response = await POST(new Request("http://127.0.0.1:3015/api/runtime/sweep", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(mocks.runOperationalSweep).not.toHaveBeenCalled();
  });

  it("runs one bounded sweep and returns a compact summary", async () => {
    vi.stubEnv("OPENPRESENCE_SCHEDULER_TOKEN", "scheduler-secret");
    const response = await POST(new Request("http://127.0.0.1:3015/api/runtime/sweep", {
      method: "POST",
      headers: { "x-openpresence-scheduler-token": "scheduler-secret" },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      reclaimedLeases: 2,
      staleRuns: 1,
      dispatchedWakes: 1,
    });
    expect(mocks.runOperationalSweep).toHaveBeenCalledTimes(1);
    expect(mocks.recordProcessHeartbeat).toHaveBeenCalledTimes(2);
  });
});
