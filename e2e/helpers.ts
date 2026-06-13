import { expect, type Page, type Locator } from "@playwright/test";
import { THEMES } from "../lib/vocab";

export const THEME = THEMES.find((t) => t.id === "numbers")!;

export type Dir = "en2bg" | "bg2en";

const DIR_LABEL: Record<Dir, string> = {
  en2bg: "EN → BG",
  bg2en: "BG → EN",
};

export async function start(
  page: Page,
  opts: { diff?: string; dir?: Dir; theme?: string } = {},
) {
  const diff = opts.diff ?? "Easy";
  const dir = DIR_LABEL[opts.dir ?? "en2bg"];
  const themeName = opts.theme ?? THEME.name;
  await page.goto("/");
  await expect(page.getByTestId("menu")).toBeVisible();
  await page.getByRole("button", { name: diff }).click();
  await page.getByRole("button", { name: dir }).click();
  await page.getByRole("button", { name: themeName }).click();
  await expect(page.getByTestId("play")).toBeVisible();
}

export const fallingBubble = (page: Page): Locator =>
  page.locator('[data-testid="bubble"][data-state="answering"]');

// Input is always visible — no tap required.
export async function pop(page: Page) {
  await expect(page.getByTestId("answer-input")).toBeVisible();
}

export function answerFor(prompt: string, dir: Dir): string {
  const p = prompt.trim();
  const word =
    dir === "en2bg"
      ? THEME.words.find((w) => w.en === p)
      : THEME.words.find((w) => w.bg === p);
  if (!word) throw new Error(`prompt not found in vocab: "${p}"`);
  return dir === "en2bg" ? word.bg : word.en.split("/")[0].trim();
}

export async function answer(page: Page, text: string) {
  const input = page.getByTestId("answer-input");
  await input.fill(text);
  await input.press("Enter");
}

export async function answerCorrect(page: Page, dir: Dir) {
  await pop(page);
  const prompt = (await page.getByTestId("prompt").textContent()) ?? "";
  await answer(page, answerFor(prompt, dir));
}

export async function lives(page: Page): Promise<number> {
  return Number(await page.getByTestId("lives").getAttribute("data-lives"));
}

// Pop, answer wrong, and (when not the final life) clear the retype-to-continue
// correction step. Returns true if this miss ended the run.
export async function failRound(page: Page): Promise<boolean> {
  await pop(page);
  await answer(page, "definitelywrong");
  const fb = page.getByTestId("feedback");
  await expect(fb).toBeVisible();
  if ((await fb.getAttribute("data-mode")) === "feedback") return true; // game over
  const target = (await page.getByTestId("fb-bg").textContent())!.trim();
  const ci = page.getByTestId("correction-input");
  await ci.fill(target);
  await ci.press("Enter");
  await expect(page.getByTestId("feedback")).toHaveCount(0); // advanced to next
  return false;
}

export async function loseAllLives(page: Page) {
  for (let guard = 0; guard < 12; guard++) {
    if (await failRound(page)) break;
  }
  await expect(page.getByTestId("gameover")).toBeVisible();
}
