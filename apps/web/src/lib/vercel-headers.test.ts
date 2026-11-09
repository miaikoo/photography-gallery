import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Rule = { source: string; headers: { key: string; value: string }[] };

const config = JSON.parse(
  readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"),
) as { headers: Rule[] };

const expected: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'",
};

describe("vercel.json security headers", () => {
  const allPaths = config.headers.filter((rule) => rule.source === "/(.*)");

  it("has a rule that matches all paths", () => {
    expect(allPaths).toHaveLength(1);
  });

  it.each(Object.entries(expected))("sets %s on all paths", (key, value) => {
    expect(allPaths[0]?.headers).toContainEqual({ key, value });
  });
});
