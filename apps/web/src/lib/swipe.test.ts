import { describe, expect, it } from "vitest";
import { classifySwipe, dampedOffset } from "./swipe";

describe("classifySwipe", () => {
  it("passes on distance", () => {
    expect(classifySwipe({ dx: -90, dy: 5, ms: 500 })).toBe("next");
    expect(classifySwipe({ dx: 90, dy: 5, ms: 500 })).toBe("prev");
  });

  it("passes on velocity", () => {
    expect(classifySwipe({ dx: -30, dy: 2, ms: 100 })).toBe("next");
  });

  it("ignores a slow short drag", () => {
    expect(classifySwipe({ dx: -30, dy: 2, ms: 1000 })).toBeNull();
  });

  it("ignores a mostly vertical drag", () => {
    expect(classifySwipe({ dx: -90, dy: 120, ms: 200 })).toBeNull();
  });

  it("ignores a tiny movement", () => {
    expect(classifySwipe({ dx: -5, dy: 0, ms: 10 })).toBeNull();
  });

  it("handles zero elapsed time", () => {
    expect(classifySwipe({ dx: -30, dy: 0, ms: 0 })).toBe("next");
  });
});

describe("dampedOffset", () => {
  it("resists at the ends", () => expect(dampedOffset(100, true)).toBe(30));
  it("follows the finger elsewhere", () => expect(dampedOffset(100, false)).toBe(100));
});
