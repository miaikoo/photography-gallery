// Keeps generated fixture photos out of production output.
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.CONTENT_SOURCE !== "fixtures") {
  const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  rmSync(join(webRoot, "public/fixture-photos"), { recursive: true, force: true });
}
