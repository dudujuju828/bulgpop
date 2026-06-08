# BulgaPop 🫧

A tiny browser game for learning Bulgarian vocabulary. Pick a theme, bubbles
fall from the top — **pop one and type the word before it hits the bottom**.
Bulgarian is written with normal Latin letters here, so _"behind us"_ is
`zad nas`.

- **Pop, then type — under pressure** — click a falling bubble to reveal the
  prompt and an input box. The bubble **keeps falling while you type**; if it
  reaches the bottom before you submit, you lose a life.
- **Lives + endless** — miss or answer wrong and you lose a life. Fall speed
  ramps up the longer you survive. Beat your high score (saved locally).
- **Difficulty modes** — Easy (slow, 5 lives), Normal (3 lives), Hard (fast,
  2 lives, steep ramp).
- **Direction modes** — EN → BG (type Bulgarian), BG → EN (type English), or
  Mixed (random each bubble).
- **Pronunciation** — Bulgarian words are spoken aloud via browser text-to-speech
  (auto where it won't spoil the answer, plus a replay 🔊 button). Falls back
  silently if no Bulgarian voice is installed.
- **Learn on every round** — feedback shows the correct Latin spelling _and_ the
  Cyrillic.
- **End-of-game recap** — accuracy %, words seen, and a "words to review" list of
  everything you missed.
- **Nine themes** — Everyday phrases, Food & drink, Travel & places, Numbers &
  time, Family & people, Body & health, Weather & nature, Shopping & money, and
  Common verbs (~30 words each).

## Run it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Stack

Next.js (App Router) + React + TypeScript. No external game/UI libraries — the
bubbles, animations, and sound are all hand-rolled. Vocabulary lives in
[`lib/vocab.ts`](lib/vocab.ts) — edit that file to add words or themes.

## Answer checking

Answers are matched exactly, after trimming, lowercasing, dropping punctuation,
and collapsing extra spaces. A `/` in a vocabulary value marks alternatives, so
`hand / arm` accepts either word. To loosen matching further, edit `normalize` /
`matches` in `lib/vocab.ts`.
