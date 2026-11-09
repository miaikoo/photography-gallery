import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExifTool } from "exiftool-vendored";
import { onTestFinished } from "vitest";

export async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "gallery photos "));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

export async function writeTestTags(file: string, tags: Record<string, unknown>): Promise<void> {
  const writer = new ExifTool({ maxProcs: 1 });
  try {
    await writer.write(file, tags, { writeArgs: ["-overwrite_original"] });
  } finally {
    await writer.end();
  }
}
