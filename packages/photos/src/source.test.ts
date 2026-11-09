import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkSourceFolder } from "./source";
import { tempDir } from "./test-utils";

async function repo(ignore?: string) {
  const root = await tempDir();
  execFileSync("git", ["init", "-q"], { cwd: root });
  if (ignore) await writeFile(join(root, ".gitignore"), ignore);
  return root;
}

const folder = async (root: string, ...parts: string[]) => {
  const dir = join(root, ...parts);
  await mkdir(dir, { recursive: true });
  return dir;
};

describe("checkSourceFolder", () => {
  it("allows a folder inside the repo that git ignores", async () => {
    const root = await repo("originals/\n");
    await expect(checkSourceFolder(await folder(root, "originals", "trip"))).resolves.toBeUndefined();
  });

  it("refuses a folder inside the repo that git doesn't ignore, naming it and pointing to originals/", async () => {
    const root = await repo("originals/\n");
    const dir = await folder(root, "Pictures", "trip");
    await expect(checkSourceFolder(dir)).rejects.toThrow(dir);
    await expect(checkSourceFolder(dir)).rejects.toThrow(/originals\//);
  });

  it("allows a folder outside any repo", async () => {
    await expect(checkSourceFolder(await folder(await tempDir(), "trip"))).resolves.toBeUndefined();
  });

  it("refuses when git fails for another reason", async () => {
    const root = await repo("originals/\n");
    const dir = await folder(root, "originals", "trip");
    await writeFile(join(root, ".git", "index"), "garbage garbage garbage");
    await writeFile(join(root, ".git", "config"), "[core\n");
    await expect(checkSourceFolder(dir)).rejects.toThrow(/git/i);
  });
});
