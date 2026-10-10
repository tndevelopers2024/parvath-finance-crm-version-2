import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const scenario = process.argv[2] || "journeys";
if (!["journeys", "visuals"].includes(scenario))
  throw new Error("Choose journeys or visuals");
// The journeys are a real script; the visuals scenario is still read from its document.
if (scenario === "journeys") {
  const run = spawnSync(
    process.execPath,
    [path.join(import.meta.dirname, "browser-journeys.mjs")],
    { cwd: process.cwd(), env: process.env, stdio: "inherit" },
  );
  process.exit(run.status ?? 1);
}
const text = readFileSync(`docs/browser-${scenario}.md`, "utf8");
const code = text.match(/```javascript\n([\s\S]*?)\n```/)?.[1];
if (!code) throw new Error("Documented browser scenario missing");
const file = path.join(
  mkdtempSync(path.join(tmpdir(), "parvath-browser-")),
  "scenario.cjs",
);
writeFileSync(file, code);
const result = spawnSync(process.execPath, [file], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
