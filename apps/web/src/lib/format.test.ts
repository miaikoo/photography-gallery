import { expect, it } from "vitest";
import { formatCount, formatDate, formatShortDate } from "./format";

it("formats long dates without shifting the day", () => {
  expect(formatDate("2026-08-17")).toBe("August 17, 2026");
});
it("formats short dates", () => expect(formatShortDate("2026-08-17")).toBe("Aug 17, 2026"));
it("uses the singular for one photo", () => expect(formatCount(1)).toBe("1 photo"));
it("uses the plural otherwise", () => expect(formatCount(22)).toBe("22 photos"));
