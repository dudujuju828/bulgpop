import { test, expect, type Page } from "@playwright/test";
import { THEMES } from "../lib/vocab";
import { loseAllLives } from "./helpers";

const LAST_THEME = THEMES[THEMES.length - 1].name; // bottom of the menu grid

const viewports = [
  { width: 1280, height: 720, label: "desktop" },
  { width: 768, height: 600, label: "short" },
  { width: 360, height: 640, label: "mobile" },
];

async function inViewport(page: Page, testid: string): Promise<boolean> {
  const box = await page.getByTestId(testid).boundingBox();
  if (!box) return false;
  const vh = page.viewportSize()!.height;
  return box.y >= -1 && box.y + box.height <= vh + 1;
}

test.describe("responsive layout & scroll", () => {
  for (const v of viewports) {
    test(`menu: bottom theme is reachable and clickable (${v.label})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: v.width, height: v.height });
      await page.goto("/");
      await expect(page.getByTestId("menu")).toBeVisible();

      // Nothing is clipped above the top of the page.
      const menuBox = await page.getByTestId("menu").boundingBox();
      expect(menuBox!.y).toBeGreaterThanOrEqual(-1);

      // The last theme card lives at the bottom of a list taller than the
      // viewport; it must be scrollable into view and actually clickable.
      const lastTheme = page.getByRole("button", { name: LAST_THEME });
      await lastTheme.scrollIntoViewIfNeeded();
      await expect(lastTheme).toBeInViewport();
      await lastTheme.click();

      // Clicking it starts the game — proves the control was truly interactive.
      await expect(page.getByTestId("play")).toBeVisible();
    });
  }

  test("portrait: the word is on the bubble and stays visible while typing", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 1180 }); // iPad portrait
    await page.goto("/");
    await page.getByRole("button", { name: "Easy" }).click();
    await page.getByRole("button", { name: THEMES[3].name }).click(); // numbers
    await expect(page.getByTestId("play")).toBeVisible();

    // The prompt is rendered *inside* the bubble (not in a dock that the
    // keyboard would cover).
    const prompt = page.getByTestId("prompt");
    await expect(prompt).toBeVisible();
    const insideBubble = await prompt.evaluate(
      (el) => !!el.closest('[data-testid="bubble"]'),
    );
    expect(insideBubble).toBe(true);

    // Pop it; the input appears and the word is still on the (now active)
    // bubble and within the viewport.
    const bubble = page.locator('[data-testid="bubble"][data-state="falling"]');
    await bubble.evaluate((el) => (el as HTMLElement).click());
    await expect(page.getByTestId("answer-input")).toBeVisible();
    await expect(page.getByTestId("prompt")).toBeVisible();
    await expect(page.getByTestId("prompt")).toBeInViewport();
  });

  test("in-game screen fits the viewport with no page scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto("/");
    await page.getByRole("button", { name: "Easy" }).click();
    await page.getByRole("button", { name: THEMES[0].name }).click();
    await expect(page.getByTestId("play")).toBeVisible();

    // The page itself must not scroll while playing (the fall area is fixed).
    const scrolls = await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight + 2,
    );
    expect(scrolls).toBe(false);

    // HUD controls are on-screen.
    expect(await inViewport(page, "score")).toBe(true);
    expect(await inViewport(page, "lives")).toBe(true);
    await expect(page.getByRole("button", { name: "menu" })).toBeInViewport();
  });

  test("game-over recap scrolls and 'Change setup' is reachable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto("/");
    await page.getByRole("button", { name: "Easy" }).click();
    await page.getByRole("button", { name: THEMES[3].name }).click(); // numbers
    await expect(page.getByTestId("play")).toBeVisible();

    await loseAllLives(page);
    const changeSetup = page.getByRole("button", { name: "Change setup" });
    await changeSetup.scrollIntoViewIfNeeded();
    await expect(changeSetup).toBeInViewport();
    await changeSetup.click();
    await expect(page.getByTestId("menu")).toBeVisible();
  });
});
