import { afterEach, describe, expect, it, vi } from "vitest";
import { autonomyRunHasPriority, autonomyWorkerConcurrencyLimit } from "../lib/autonomy-worker";
import type { OperationalRun } from "../lib/types";

describe("autonomy worker concurrency", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("protects the development UI with one provider/model worker", () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.OPENPRESENCE_AUTONOMY_MAX_CONCURRENCY;
    expect(autonomyWorkerConcurrencyLimit()).toBe(1);
  });

  it("honors an explicit bounded concurrency override", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("OPENPRESENCE_AUTONOMY_MAX_CONCURRENCY", "3");
    expect(autonomyWorkerConcurrencyLimit()).toBe(3);
    vi.stubEnv("OPENPRESENCE_AUTONOMY_MAX_CONCURRENCY", "99");
    expect(autonomyWorkerConcurrencyLimit()).toBe(4);
  });

  it("marks Bridge inbound attention as priority without broadening the worker bound", () => {
    const run = { kind: "attention", attention: { source: "bridge", triggers: ["inbound_event"], scope: "broad", requestedAt: new Date().toISOString(), signalIds: ["signal"] } } as OperationalRun;
    expect(autonomyRunHasPriority(run)).toBe(true);
    expect(autonomyRunHasPriority({ kind: "discovery" } as OperationalRun)).toBe(false);
  });
});
