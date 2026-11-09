import { execFileSync } from "node:child_process";

function git(dir: string, ...args: string[]): string {
  return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function inspect(dir: string): "outside" | "ignored" | "exposed" | `failed: ${string}` {
  try {
    const inside = git(dir, "rev-parse", "--is-inside-work-tree").trim();
    if (inside !== "true") return `failed: not inside a work tree (rev-parse said "${inside}")`;
    git(dir, "check-ignore", "-q", "--", dir);
    return "ignored";
  } catch (error) {
    const { code, status, stderr } = error as { code?: string; status?: number; stderr?: unknown };
    const text = String(stderr ?? "");
    if (code === "ENOENT" || text.includes("not a git repository")) return "outside";
    // check-ignore exits 1 for a path that isn't ignored; rev-parse never does.
    if (status === 1 && text === "") return "exposed";
    return `failed: ${text.trim() || (error as Error).message}`;
  }
}

// Originals must never be stageable, so a source folder inside a repo has to be git-ignored.
export async function checkSourceFolder(dir: string): Promise<void> {
  const state = inspect(dir);
  const advice = "Put your photos under originals/, which git ignores, and run again";
  if (state === "exposed") {
    throw new Error(`${dir} is inside this repository and git doesn't ignore it, so its photos could be committed. ${advice}`);
  }
  if (state.startsWith("failed")) throw new Error(`Could not check ${dir} with git (${state.slice(8)}). ${advice}`);
}
