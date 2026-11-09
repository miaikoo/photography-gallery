import { afterEach, describe, expect, it, vi } from "vitest";
import { getSiteUrl } from "./site-url";

describe("getSiteUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns SITE_URL without a trailing slash", () => {
    vi.stubEnv("SITE_URL", "https://miaikoo.vercel.app/");
    expect(getSiteUrl()).toBe("https://miaikoo.vercel.app");
  });

  it("defaults to localhost outside production", () => {
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("VERCEL_ENV", "");
    expect(getSiteUrl()).toBe("http://localhost:4173");
  });

  it("throws in production when SITE_URL is unset", () => {
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => getSiteUrl()).toThrow(/SITE_URL/);
  });
});
