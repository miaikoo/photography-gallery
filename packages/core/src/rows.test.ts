import { expect, it } from "vitest";
import { alternateRows, buildRows, displayOrder, ratioOf } from "./rows";

const L = { width: 3, height: 2 };
const P = { width: 2, height: 3 };
const S = { width: 1, height: 1 };
const W = { width: 3, height: 1 };

it("returns no rows for no photos", () => expect(buildRows([])).toEqual([]));
it("keeps a lone photo as one row", () => expect(buildRows([L])).toEqual([[L]]));
it("pairs landscape and portrait, then two landscapes", () =>
  expect(buildRows([L, P, L, L])).toEqual([[L, P], [L, L]]));
it("fills a row with three portraits", () =>
  expect(buildRows([P, P, P, L, L])).toEqual([[P, P, P], [L, L]]));
it("merges a leftover into the previous row", () =>
  expect(buildRows([L, L, P])).toEqual([[L, L, P]]));
it("keeps a leftover landscape on its own row", () =>
  expect(buildRows([W, L])).toEqual([[W], [L]]));
it("keeps a landscape after a mixed row on its own row", () =>
  expect(buildRows([L, P, L])).toEqual([[L, P], [L]]));
it("merges a leftover portrait into the previous row", () =>
  expect(buildRows([L, P, P])).toEqual([[L, P, P]]));
it("handles square photos", () => expect(buildRows([S, L])).toEqual([[S, L]]));
it("merges a leftover square", () =>
  expect(buildRows([L, L, S])).toEqual([[L, L, S]]));
it("merges a leftover portrait pair", () =>
  expect(buildRows([L, L, P, P])).toEqual([[L, L, P, P]]));
it("computes the width-to-height ratio", () => expect(ratioOf(L)).toBe(1.5));

it("mirrors a mixed row that repeats the row above", () =>
  expect(alternateRows([[L, P], [L, P]])).toEqual([[L, P], [P, L]]));
it("compares with the row as displayed, so a run keeps alternating", () =>
  expect(alternateRows([[L, P], [L, P], [L, P]])).toEqual([[L, P], [P, L], [L, P]]));
it("leaves a row alone when it already differs from the row above", () =>
  expect(alternateRows([[L, P], [P, L], [L, L]])).toEqual([[L, P], [P, L], [L, L]]));
it("keeps the order of a row that reads the same both ways", () => {
  const first = { width: 3, height: 2 };
  const second = { width: 16, height: 9 };
  const row = [first, second];
  expect(alternateRows([[L, L], row])[1]).toBe(row);
});
it("lists photos in the order the rows display them", () =>
  expect(displayOrder([L, P, S, P])).toEqual([L, P, P, S]));
