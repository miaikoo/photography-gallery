import { expect, test } from "@playwright/test";

const ready = (page: import("@playwright/test").Page) =>
  expect(page.locator("[data-gestures-ready]")).toHaveCount(1);

test("two portraits never overflow the page", async ({ page }) => {
  await page.goto("/events/two-frames/");
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scroll).toBeLessThanOrEqual(page.viewportSize()!.width);
  const boxes = await Promise.all((await page.locator("[data-row] img").all()).map((img) => img.boundingBox()));
  for (const box of boxes) {
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
});

test("many tags leave the event title readable", async ({ page }) => {
  await page.goto("/events/many-tags/");
  const title = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
  expect(title.width).toBeGreaterThan(150);
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scroll).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("a lazy image that fails shows its alt text", async ({ page }) => {
  await page.route("**/fixture-photos/large-roll/22-*", (route) => route.abort());
  await page.goto("/events/large-roll/", { waitUntil: "networkidle" });
  const img = page.locator('img[src*="large-roll/22-"]');
  await img.scrollIntoViewIfNeeded();
  await expect(img).toHaveCSS("opacity", "1");
});

for (const route of ["/", "/tags/", "/about/", "/events/morning-fog/", "/tags/nature/", "/events/morning-fog/02/"]) {
  test(`share tags exist on ${route}`, async ({ page }) => {
    await page.goto(route);
    for (const property of ["og:title", "og:description", "og:image"]) {
      await expect(page.locator(`meta[property="${property}"]`)).toHaveAttribute("content", /.+/);
    }
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.+/);
  });
}

test("each photo page has its own title", async ({ page }) => {
  await page.goto("/events/morning-fog/03/");
  await expect(page).toHaveTitle("Morning Fog, photo 3 of 6 · miaikoo");
});

test("the main photo allows pinch zoom", async ({ page }) => {
  await page.goto("/events/morning-fog/01/");
  await expect(page.locator(".photo-gestures")).toHaveCSS("touch-action", "pan-y pinch-zoom");
});

test("the caption scrim only clears the credit corner", async ({ page }) => {
  await page.goto("/");
  const mask = await page
    .locator(".photo-caption")
    .first()
    .evaluate((el) => getComputedStyle(el, "::before").maskImage);
  expect(mask.match(/linear-gradient/g)).toHaveLength(2);
});

test("the current thumbnail stays in view in a large event", async ({ page, viewport }) => {
  test.skip(viewport?.width !== 1440);
  await page.goto("/events/large-roll/18/");
  await ready(page);
  const current = page.locator('a[aria-current="page"]');
  const panel = (await page.locator(".photo-thumbs").boundingBox())!;
  await expect(async () => {
    const box = (await current.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(panel.y);
    expect(box.y + box.height).toBeLessThanOrEqual(panel.y + panel.height);
  }).toPass();
});

test("homepage to event to photo, then back", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Morning Fog/ }).click();
  await expect(page).toHaveURL(/\/events\/morning-fog\/$/);
  await page.locator('a[href="/events/morning-fog/03/"]').click();
  await expect(page).toHaveURL(/\/events\/morning-fog\/03\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/events\/morning-fog\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/localhost:4173\/$/);
});

test("next stays in the event after arriving from a tag page", async ({ page }) => {
  await page.goto("/tags/nature/");
  await page.locator('a[href="/events/wet-night-downtown/04/"]').click();
  await expect(page).toHaveURL(/wet-night-downtown\/04\/$/);
  await expect(page.getByRole("link", { name: "Next photo" })).toHaveCount(0);
  await page.getByRole("link", { name: "Previous photo" }).click();
  await expect(page).toHaveURL(/wet-night-downtown\/03\/$/);
});

test("a thumbnail opens its photo", async ({ page }) => {
  await page.goto("/events/morning-fog/01/");
  await page.getByRole("link", { name: "Photo 3 of 6" }).click();
  await expect(page).toHaveURL(/morning-fog\/03\/$/);
  await expect(page.locator('a[aria-current="page"]')).toHaveAccessibleName("Photo 3 of 6");
});
