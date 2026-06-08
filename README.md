# BulgaPop 🫧

A tiny browser game for learning Bulgarian vocabulary. Pick a theme, bubbles
fall from the top — **pop one before it hits the bottom**, then type the word in
Bulgarian. Bulgarian is written with normal Latin letters here, so _"behind us"_
is `zad nas`.

- **Pop, then type** — click a falling bubble to reveal the English word and an
  input box appears. Type the Bulgarian and hit Enter.
- **3 lives, endless** — miss a bubble or get it wrong and you lose a life. Speed
  ramps up the longer you survive. Beat your high score (saved locally).
- **Learn on a miss** — every round shows the correct Latin spelling _and_ the
  Cyrillic, so you pick it up as you go.
- **Four themes** — Everyday phrases, Food & drink, Travel & places, Numbers &
  time.

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

Answers are matched exactly, after trimming, lowercasing, and collapsing extra
spaces. To accept alternate spellings, change `normalize` in `lib/vocab.ts` or
store multiple accepted forms per word.
