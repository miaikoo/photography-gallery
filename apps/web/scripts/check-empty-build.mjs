// Verifies the production build made with no events.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "../out");
const problems = [];

if (!readFileSync(join(out, "index.html"), "utf8").includes("No photos yet.")) {
  problems.push("The homepage doesn't show the empty state");
}
if (existsSync(join(out, "fixture-photos"))) problems.push("Fixture photos are in the output");

const leftovers = readdirSync(out, { recursive: true }).filter((path) => String(path).includes("__none"));
if (leftovers.length > 0) problems.push(`Placeholder output remains: ${leftovers.join(", ")}`);

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("Empty production build is clean.");
