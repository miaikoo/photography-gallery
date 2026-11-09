import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const ROUTES = [
  "/",
  "/events/morning-fog/",
  "/events/morning-fog/01/",
  "/events/morning-fog/02/",
  "/tags/",
  "/tags/nature/",
  "/about/",
  "/does-not-exist/",
];

for (const route of ROUTES) {
  test(`no accessibility violations on ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "networkidle" });
    // Axe can't measure text over an image, so captions are checked by eye on real photos.
    const results = await new AxeBuilder({ page }).exclude(".photo-caption").analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
  });
}

test("keyboard reaches the header and photo controls with a visible focus style", async ({ page, viewport }) => {
  test.skip(viewport?.width !== 1440);
  await page.goto("/events/morning-fog/02/", { waitUntil: "networkidle" });
  const visited: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement;
      const style = getComputedStyle(element);
      return {
        name: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "",
        outline: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
      };
    });
    expect(focus.outline).not.toBe("none");
    expect(focus.outlineWidth).toBeGreaterThanOrEqual(2);
    visited.push(focus.name);
  }
  expect(visited).toEqual(
    expect.arrayContaining(["miaikoo", "events", "tags", "about", "Previous photo", "Next photo", "copy link"]),
  );
});

test("tag index shows a cover for each tag", async ({ page }) => {
  await page.goto("/tags/");
  await expect(page.locator("[data-row] img")).toHaveCount(18);
});
