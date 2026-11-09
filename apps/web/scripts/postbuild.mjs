// Removes the placeholder pages that static export needs when a route has no content.
import { readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "../out");

for (const entry of readdirSync(out, { recursive: true, withFileTypes: true })) {
  if (entry.name.startsWith("__none")) {
    rmSync(join(entry.parentPath, entry.name), { recursive: true, force: true });
  }
}
