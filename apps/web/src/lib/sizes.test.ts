import { expect, it } from "vitest";
import { rowSizes } from "./sizes";

it("sizes a photo by its share of the row", () => {
  expect(rowSizes(1.5, 3)).toBe("(min-width: 640px) 50vw, 100vw");
});
