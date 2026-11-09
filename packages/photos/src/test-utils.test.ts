import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tempDir } from "./test-utils";

describe("tempDir", () => {
  let previous: string;

  it("creates a folder whose name has a space", async () => {
    previous = await tempDir();
    expect(existsSync(previous)).toBe(true);
    expect(previous).toContain(" ");
  });

  it("removes the folder after the test", () => {
    expect(existsSync(previous)).toBe(false);
  });
});
