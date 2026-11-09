import { existsSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeExif } from "./exif";
import { checkPrivacy } from "./privacy";
import { runEvent } from "./publish";
import { checkSourceFolder } from "./source";

const USAGE = ["Usage: pnpm photos <folder>   e.g. pnpm photos originals/bromo-trip", "       pnpm test:privacy"];

async function photos(folder: string | undefined, repoRoot: string, log: (line: string) => void): Promise<number> {
  if (!folder) {
    USAGE.forEach(log);
    return 1;
  }
  const source = resolve(repoRoot, folder);
  if (!existsSync(source) || !statSync(source).isDirectory()) {
    log(`Folder not found: ${folder}`);
    return 1;
  }
  await checkSourceFolder(source);
  const result = await runEvent(
    source,
    {
      contentDir: join(repoRoot, "content", "events"),
      photosDir: join(repoRoot, "apps", "web", "public", "photos"),
    },
    (file, status) => log(`${file} ${status}`),
  );
  result.messages.forEach(log);
  if (result.status !== "published") {
    const name = basename(source);
    log(`Edit ${folder.replace(/[\/]+$/, "")}/event.json, then run: pnpm photos originals/${name}`);
  }
  return 0;
}

async function privacy(repoRoot: string, log: (line: string) => void): Promise<number> {
  const problems = await checkPrivacy({
    photosDir: join(repoRoot, "apps", "web", "public", "photos"),
    contentRoot: join(repoRoot, "content"),
    repoRoot,
  });
  if (problems.length === 0) {
    log("Privacy check passed: the site is clean");
    return 0;
  }
  problems.forEach(log);
  log(`Privacy check failed: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  return 1;
}

export async function main(argv: string[], repoRoot: string, log: (line: string) => void): Promise<number> {
  try {
    const [command, folder] = argv;
    if (command === "photos") return await photos(folder, repoRoot, log);
    if (command === "privacy") return await privacy(repoRoot, log);
    USAGE.forEach(log);
    return 1;
  } catch (error) {
    log(`Error: ${(error as Error).message}`);
    return 1;
  } finally {
    await closeExif();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
  process.exitCode = await main(process.argv.slice(2), repoRoot, (line) => console.log(line));
}
