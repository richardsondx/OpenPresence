import path from "node:path";

process.env.OPENPRESENCE_DB_PATH = path.join(process.cwd(), "data", "vitest.db");
process.env.OPENPRESENCE_TEST_MODE = "1";
process.env.OPENPRESENCE_TEST_RUNTIME = "1";
