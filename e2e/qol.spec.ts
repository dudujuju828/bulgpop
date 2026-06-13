import { test, expect } from "@playwright/test";
import { start, pop, answer, answerFor, fallingBubble, loseAllLives } from "./helpers";

// ---- fall speed control ---------------------------------------------------

test.describe("fall speed presets", () => {
  test("all four presets appear in menu and selection toggles aria-pressed", async ({
    page,
  }) => {
    await page.goto("/");
    // Use data-testid to avoid ambiguity with the "Normal" difficulty button.
    const presets = ["relaxed", "normal", "brisk", "fast"] as const;
    for (const id of presets) {
      await expect(page.getByTestId(`fall-preset-${id}`)).toBeVisible();
    }
    await page.getByTestId("fall-preset-relaxed").click();
    await expect(page.getByTestId("fall-preset-relaxed")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("fall-preset-normal")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await page.getByTestId("fall-preset-fast").click();
    await expect(page.getByTestId("fall-preset-fast")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("fall-preset-relaxed")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("fall speed preset persists across page reloads", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Brisk" }).click();
    await expect(page.getByRole("button", { name: "Brisk" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.reload();
    await expect(page.getByTestId("menu")).toBeVisible();
    await expect(page.getByRole("button", { name: "Brisk" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("Steady toggle persists across reloads", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("steady-speed-toggle").click();
    await expect(page.getByTestId("steady-speed-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.reload();
    await expect(page.getByTestId("steady-speed-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Turn it back off so it doesn't bleed into other tests.
    await page.getByTestId("steady-speed-toggle").click();
  });
});

// ---- zen mode -------------------------------------------------------------

test.describe("zen mode", () => {
  test("Zen mode toggle appears in menu and shows ∞ in HUD", async ({
    page,
  }) => {
    await page.goto("/");
    const zenBtn = page.getByTestId("zen-mode-toggle");
    await expect(zenBtn).toBeVisible();
    await zenBtn.click();
    await expect(zenBtn).toHaveAttribute("aria-pressed", "true");
    await start(page, { diff: "Easy", dir: "en2bg" });
    // HUD should show ∞ instead of hearts.
    await expect(page.getByTestId("lives")).toContainText("∞");
  });

  test("in Zen mode a wrong answer does NOT lose a life and has no correction step", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("zen-mode-toggle").click();
    await start(page, { diff: "Easy", dir: "en2bg" });

    await pop(page);
    await answer(page, "definitelywrong");

    const fb = page.getByTestId("feedback");
    await expect(fb).toHaveAttribute("data-feedback", "wrong");
    // Zen: feedback mode, NOT correcting.
    await expect(fb).toHaveAttribute("data-mode", "feedback");
    // Lives display stays at ∞.
    await expect(page.getByTestId("lives")).toContainText("∞");
  });

  test("Zen mode setting persists across reloads", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("zen-mode-toggle").click();
    await page.reload();
    await expect(page.getByTestId("zen-mode-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Clean up.
    await page.getByTestId("zen-mode-toggle").click();
  });
});

// ---- pause ---------------------------------------------------------------

test.describe("pause control", () => {
  test("pause button appears while a bubble is falling and toggles aria-pressed", async ({
    page,
  }) => {
    await start(page, { diff: "Easy", dir: "en2bg" });
    const pauseBtn = page.getByTestId("pause-btn");
    await expect(pauseBtn).toBeVisible();
    await expect(pauseBtn).toHaveAttribute("aria-pressed", "false");
    await pauseBtn.click();
    await expect(pauseBtn).toHaveAttribute("aria-pressed", "true");
    // Pause overlay appears.
    await expect(page.getByTestId("pause-overlay")).toBeVisible();
  });

  test("clicking resume from overlay un-pauses the game", async ({ page }) => {
    await start(page, { diff: "Easy", dir: "en2bg" });
    await page.getByTestId("pause-btn").click();
    await expect(page.getByTestId("pause-overlay")).toBeVisible();
    // Click the resume button inside the overlay (not the HUD pause button).
    await page.getByTestId("pause-overlay").getByRole("button").click();
    await expect(page.getByTestId("pause-overlay")).toHaveCount(0);
    await expect(page.getByTestId("pause-btn")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("bubble position does not change while paused", async ({ page }) => {
    await start(page, { diff: "Easy", dir: "en2bg" });
    // Wait for bubble to be well into the play area before pausing.
    const bubble = fallingBubble(page);
    await expect(bubble).toBeVisible();
    await page.getByTestId("pause-btn").click();
    await expect(page.getByTestId("pause-overlay")).toBeVisible();
    const before = await bubble.boundingBox();
    await page.waitForTimeout(600);
    const after = await bubble.boundingBox();
    // Y should not have moved while paused.
    expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(2);
  });
});

// ---- hint feature --------------------------------------------------------

test.describe("hint button", () => {
  test("hint button appears in answering state and reveals first letter", async ({
    page,
  }) => {
    await start(page, { diff: "Easy", dir: "en2bg" });
    await pop(page);
    const hintBtn = page.getByTestId("hint-btn");
    await expect(hintBtn).toBeVisible();
    await expect(hintBtn).not.toBeDisabled();
    await hintBtn.click();
    await expect(page.getByTestId("hint-text")).toBeVisible();
    // Hint text should say "starts with: X…" for some letter X.
    await expect(page.getByTestId("hint-text")).toContainText("starts with:");
  });

  test("hint button becomes disabled after first use", async ({ page }) => {
    await start(page, { diff: "Easy", dir: "en2bg" });
    await pop(page);
    await page.getByTestId("hint-btn").click();
    await expect(page.getByTestId("hint-btn")).toBeDisabled();
  });

  test("hint resets on the next bubble", async ({ page }) => {
    await start(page, { diff: "Easy", dir: "en2bg" });
    await pop(page);
    await page.getByTestId("hint-btn").click();
    await expect(page.getByTestId("hint-text")).toBeVisible();
    // Answer correctly to advance to next round.
    const prompt = (await page.getByTestId("prompt").textContent()) ?? "";
    await answer(page, answerFor(prompt, "en2bg"));
    // Wait for next bubble to appear.
    await expect(fallingBubble(page)).toBeVisible();
    await pop(page);
    // Hint text should be gone and button re-enabled.
    await expect(page.getByTestId("hint-text")).toHaveCount(0);
    await expect(page.getByTestId("hint-btn")).not.toBeDisabled();
  });
});

// ---- recap TTS buttons ---------------------------------------------------

test.describe("recap TTS buttons", () => {
  test("missed words in recap each have a 🔊 button", async ({ page }) => {
    await start(page, { diff: "Easy", dir: "en2bg" });
    await loseAllLives(page);

    const over = page.getByTestId("gameover");
    await expect(over).toBeVisible();
    await expect(over).toContainText("Words to review");
    // Each missed word should have a Hear button.
    const speakBtns = over.getByRole("button", { name: /hear/i });
    await expect(speakBtns.first()).toBeVisible();
  });
});
