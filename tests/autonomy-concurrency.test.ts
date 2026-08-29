import { afterEach, describe, expect, it, vi } from "vitest";
import { autonomyWorkerConcurrencyLimit } from "../lib/autonomy-worker";

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
});
