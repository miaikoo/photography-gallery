import { expect, test, type Page } from "@playwright/test";

const LONG_EVENT = "a-deliberately-long-event-title-that-must-wrap-on-a-small-phone-screen";
const ROUTES = [
  "/",
  "/events/morning-fog/",
  "/events/two-frames/",
  "/events/many-tags/",
  "/events/final-square/",
  `/events/${LONG_EVENT}/`,
  `/events/${LONG_EVENT}/01/`,
  "/events/morning-fog/01/",
  "/events/morning-fog/02/",
  "/events/morning-fog/06/",
  "/tags/",
  "/tags/nature/",
  "/about/",
  "/does-not-exist/",
];

const isPhone = (project: string) => project === "phone";
// The reveal scales photos briefly, which would throw off measurements.
const settled = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));

test("homepage shows events newest first", async ({ page }) => {
  await page.goto("/");
  const titles = await page.locator("[data-caption-title]").allTextContents();
  expect(titles.slice(0, 2)).toEqual([
    "A Deliberately Long Event Title That Must Wrap on a Small Phone Screen",
    "Wet Night Downtown",
  ]);
  expect(titles.at(-1)).toBe("Final Square");
});

test("homepage covers link to events and show details", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("August 17, 2026 · 6 photos")).toBeVisible();
  await expect(page.getByText("October 12, 2026 · 1 photo", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Morning Fog/ }).click();
  await expect(page).toHaveURL(/\/events\/morning-fog\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Morning Fog" })).toBeVisible();
});

test("event photos keep their ratio", async ({ page }) => {
  await page.goto("/events/morning-fog/");
  const photos = page.locator("main img");
  await expect(photos).toHaveCount(6);
  for (const photo of await photos.all()) {
    await photo.scrollIntoViewIfNeeded();
    const box = await photo.boundingBox();
    const ratio = Number(await photo.getAttribute("width")) / Number(await photo.getAttribute("height"));
    expect(Math.abs(box!.width / box!.height - ratio) / ratio).toBeLessThan(0.01);
  }
});

test("rows share one height on laptop", async ({ page }, info) => {
  test.skip(isPhone(info.project.name));
  await page.goto("/events/wet-night-downtown/");
  await settled(page);
  const boxes = await Promise.all((await page.locator("[data-row]").first().locator("img").all()).map((img) => img.boundingBox()));
  const heights = boxes.map((box) => Math.round(box!.height));
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  expect(boxes).toHaveLength(3);
  expect(boxes[0]!.y).toBe(boxes[2]!.y);
});

test("each photo is full width on phone", async ({ page }, info) => {
  test.skip(!isPhone(info.project.name));
  await page.goto("/events/morning-fog/");
  for (const img of await page.locator("[data-row] img").all()) {
    expect(await img.evaluate((el: HTMLElement) => el.offsetWidth)).toBe(390 - 24);
  }
});

test("lone photo stays within the screen", async ({ page }, info) => {
  test.skip(isPhone(info.project.name));
  await page.goto(`/events/${LONG_EVENT}/`);
  const box = await page.locator("[data-row] img").boundingBox();
  expect(box!.height).toBeLessThanOrEqual(900);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("photos reserve space and stay visible", async ({ page }) => {
    await page.goto("/events/morning-fog/");
    for (const img of await page.locator("[data-row] img").all()) {
      const box = await img.boundingBox();
      expect(box!.width).toBeGreaterThan(0);
      expect(box!.height).toBeGreaterThan(0);
      expect(await img.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    }
  });
});

test("tag page spans events", async ({ page }) => {
  await page.goto("/tags/nature/");
  await expect(page.getByRole("heading", { level: 1, name: "nature" })).toBeVisible();
  await expect(page.locator('a[href="/events/wet-night-downtown/04/"]')).toHaveCount(1);
  await expect(page.locator('a[href="/events/morning-fog/01/"]')).toHaveCount(1);
});

test("tag index counts photos", async ({ page }) => {
  await page.goto("/tags/");
  await expect(page.getByRole("link", { name: /nature.*7/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /street.*5/ })).toBeVisible();
});

test("about hides empty fields", async ({ page }) => {
  await page.goto("/about/");
  await expect(page.getByText("I photograph streets")).toBeVisible();
  await expect(page.getByRole("link", { name: /instagram/i })).toHaveCount(0);
});

test("header navigation is lowercase", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link")).toHaveText(["events", "tags", "about"]);
  await expect(page.getByRole("link", { name: "miaikoo" })).toBeVisible();
});

test("unknown page shows not found", async ({ page }) => {
  await page.goto("/does-not-exist/");
  await expect(page.getByRole("heading", { name: "Page not found." })).toBeVisible();
});

for (const route of ROUTES) {
  test(`no horizontal scrolling on ${route}`, async ({ page }) => {
    await page.goto(route);
    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(scroll).toBeLessThanOrEqual(client);
  });
}

test("a leftover landscape cover fills the page width", async ({ page, viewport }) => {
  test.skip(viewport?.width !== 1440);
  await page.goto("/");
  const rows = page.locator("[data-row]");
  const box = (await rows.last().locator("img").boundingBox())!;
  expect(Math.round(box.width)).toBe(1440 - 48);
});
