import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  databaseIntegrityCheck: vi.fn(() => true),
  recordOperationalSuccess: vi.fn(),
  resolveOperationalIncident: vi.fn(),
  readOperationalHealth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ databaseIntegrityCheck: mocks.databaseIntegrityCheck }));
vi.mock("@/lib/incident-engine", () => ({
  recordOperationalSuccess: mocks.recordOperationalSuccess,
  resolveOperationalIncident: mocks.resolveOperationalIncident,
}));
vi.mock("@/lib/operational-context", () => ({ readOperationalHealth: mocks.readOperationalHealth }));

import { GET } from "@/app/api/runtime/health/route";

describe("runtime health recovery reconciliation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mocks.databaseIntegrityCheck.mockClear();
    mocks.recordOperationalSuccess.mockClear();
    mocks.resolveOperationalIncident.mockClear();
    mocks.readOperationalHealth.mockReset();
  });

  it("retires only a stale database incident after integrity passes", async () => {
    mocks.readOperationalHealth
      .mockReturnValueOnce({ incidents: [{ id: "db-incident", rootCauseKey: "database.corruption", safeSummary: "recovery required" }] })
      .mockReturnValueOnce({ status: "healthy", incidents: [] });
    const response = await GET(new Request("http://127.0.0.1:3015/runtime/health?presenceId=p1"));
    expect(response.status).toBe(200);
    expect(mocks.databaseIntegrityCheck).toHaveBeenCalledTimes(1);
    expect(mocks.resolveOperationalIncident).toHaveBeenCalledWith("db-incident");
    expect(await response.json()).toMatchObject({ status: "healthy", scheduler: { mode: "background" } });
  });

  it("keeps the incident when the integrity check does not pass", async () => {
    mocks.databaseIntegrityCheck.mockReturnValue(false);
    mocks.readOperationalHealth.mockReturnValue({ status: "needs_you", incidents: [{ id: "db-incident", rootCauseKey: "database.corruption" }] });
    await GET(new Request("http://127.0.0.1:3015/runtime/health?presenceId=p1"));
    expect(mocks.resolveOperationalIncident).not.toHaveBeenCalled();
  });
});
