import { defineConfig } from "vitest/config";
import dotenv from "dotenv";
dotenv.config({ quiet: true });
if (
  !process.env.TEST_MONGODB_URI ||
  !process.env.TEST_MONGODB_DB ||
  !process.env.TEST_MONGODB_DB.endsWith("_test") ||
  process.env.TEST_MONGODB_DB === process.env.MONGODB_DB
)
  throw new Error(
    "Set TEST_MONGODB_URI and a separate TEST_MONGODB_DB ending in _test",
  );
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
process.env.MONGODB_DB = process.env.TEST_MONGODB_DB;
process.env.NODE_ENV = "test";
process.env.DEMO_DATE = "2026-09-04T06:30:00.000Z";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    // Integration cases include many sequential Atlas round trips (imports and session checks).
    testTimeout: 120000,
    hookTimeout: 30000,
  },
});
