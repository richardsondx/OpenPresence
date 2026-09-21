import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

// Separate Vitest invocations must never share mutable fixtures. Keep this
// test-only identity in the worker environment so isolated module reloads and
// child-process fixtures can use the same database within one invocation.
process.env.OPENPRESENCE_VITEST_RUN_ID ??= randomUUID();
process.env.OPENPRESENCE_DB_PATH = process.env.OPENPRESENCE_VITEST_DB_PATH
  ?? path.join(os.tmpdir(), `openpresence-vitest-${process.env.OPENPRESENCE_VITEST_RUN_ID}-${process.pid}.db`);
process.env.OPENPRESENCE_TEST_MODE = "1";
