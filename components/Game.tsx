"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { THEMES, matches, type Theme, type Word } from "@/lib/vocab";
import styles from "./Game.module.css";

const BUBBLE = 132; // bubble diameter in px
const COLORS = ["pink", "yellow", "aqua", "violet"] as const;

const DIFFICULTIES = {
  easy: { id: "easy", label: "Easy", lives: 5, base: 40, ramp: 3, max: 150, sub: "slow · 5 lives" },
  normal: { id: "normal", label: "Normal", lives: 3, base: 55, ramp: 5, max: 235, sub: "medium · 3 lives" },
  hard: { id: "hard", label: "Hard", lives: 2, base: 80, ramp: 8, max: 320, sub: "fast · 2 lives" },
} as const;
type DiffId = keyof typeof DIFFICULTIES;

const DIRECTIONS = [
  { id: "en2bg", label: "EN → BG", sub: "type Bulgarian" },
  { id: "bg2en", label: "BG → EN", sub: "type English" },
  { id: "mixed", label: "Mixed", sub: "both ways" },
] as const;
type DirMode = (typeof DIRECTIONS)[number]["id"];
type Dir = "en2bg" | "bg2en";

type Phase = "menu" | "playing" | "gameover";
type BubbleState = "falling" | "answering" | "feedback";
type FeedbackType = "correct" | "wrong" | "miss";

type Round = {
  id: number;
  word: Word;
  x: number; // percent
  color: (typeof COLORS)[number];
  dir: Dir;
};

type Feedback = { type: FeedbackType; word: Word; dir: Dir; typed: string };
type Missed = { word: Word; dir: Dir; type: "wrong" | "miss" };

export default function Game() {
  const [phase, setPhase] = useState<Phase>("menu");
  const [theme, setTheme] = useState<Theme | null>(null);
  const [diffId, setDiffId] = useState<DiffId>("normal");
  const [dirMode, setDirMode] = useState<DirMode>("en2bg");

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [lives, setLives] = useState(3);
  const [maxLives, setMaxLives] = useState(3);
  const [streak, setStreak] = useState(0);
  const [muted, setMuted] = useState(false);

  const [summary, setSummary] = useState<{
    seen: number;
    correct: number;
    missed: Missed[];
  }>({ seen: 0, correct: 0, missed: [] });

  const [round, setRound] = useState<Round | null>(null);
  const [bubbleState, setBubbleState] = useState<BubbleState>("falling");
  const [y, setY] = useState(-BUBBLE);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const playRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const yRef = useRef(-BUBBLE);
  const speedRef = useRef(55);
  const roundCountRef = useRef(0);
  const gameOverRef = useRef(false);
  const lastWordRef = useRef<string>("");
  const audioRef = useRef<AudioContext | null>(null);
  const bgVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const statsRef = useRef<{ seen: number; correct: number; missed: Missed[] }>({
    seen: 0,
    correct: 0,
    missed: [],
  });

  // Latest-value refs so the rAF loop and feedback timer never need to restart
  // when unrelated state (mute, score, …) changes.
  const beepRef = useRef<(f: number, d: number, t?: OscillatorType, v?: number) => void>(
    () => {},
  );
  const speakBgRef = useRef<(cyr: string) => void>(() => {});
  const resolveRoundRef = useRef<(type: FeedbackType, typed: string) => void>(
    () => {},
  );
  const nextRoundRef = useRef<() => void>(() => {});
  const scoreRef = useRef(0);

  // ---- sound effects (WebAudio) -----------------------------------------
  const beep = useCallback(
    (freq: number, dur: number, type: OscillatorType = "sine", vol = 0.18) => {
      if (muted) return;
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = audioRef.current ?? (audioRef.current = new Ctx());
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = freq;
        o.connect(g);
        g.connect(ctx.destination);
        const t = ctx.currentTime;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.start(t);
        o.stop(t + dur);
      } catch {
        /* audio unavailable */
      }
    },
    [muted],
  );

  // ---- Bulgarian text-to-speech -----------------------------------------
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const load = () => {
      const v = synth.getVoices();
      bgVoiceRef.current =
        v.find((x) => x.lang?.toLowerCase().startsWith("bg")) ?? null;
    };
    load();
    synth.addEventListener("voiceschanged", load);
    return () => synth.removeEventListener("voiceschanged", load);
  }, []);

  const speakBg = useCallback(
    (cyr: string) => {
      if (muted) return;
      const synth = window.speechSynthesis;
      const voice = bgVoiceRef.current;
      if (!synth || !voice) return; // no Bulgarian voice → silent fallback
      synth.cancel();
      const u = new SpeechSynthesisUtterance(cyr);
      u.voice = voice;
      u.lang = "bg-BG";
      u.rate = 0.9;
      synth.speak(u);
    },
    [muted],
  );

  const ttsAvailable = () =>
    typeof window !== "undefined" && !!window.speechSynthesis;

  // ---- best score -------------------------------------------------------
  useEffect(() => {
    const saved = Number(localStorage.getItem("bulgapop-best") || 0);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe load
    if (saved) setBest(saved);
  }, []);

  // ---- rounds -----------------------------------------------------------
  const spawn = useCallback(
    (t: Theme) => {
      const cfg = DIFFICULTIES[diffId];
      roundCountRef.current += 1;
      speedRef.current = Math.min(
        cfg.base + roundCountRef.current * cfg.ramp,
        cfg.max,
      );

      let word = t.words[Math.floor(Math.random() * t.words.length)];
      if (t.words.length > 1) {
        while (word.en === lastWordRef.current) {
          word = t.words[Math.floor(Math.random() * t.words.length)];
        }
      }
      lastWordRef.current = word.en;

      const dir: Dir =
        dirMode === "mixed"
          ? Math.random() < 0.5
            ? "en2bg"
            : "bg2en"
          : dirMode;

      yRef.current = -BUBBLE;
      setY(-BUBBLE);
      setInput("");
      setFeedback(null);
      setRound({
        id: roundCountRef.current,
        word,
        x: 16 + Math.random() * 68,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        dir,
      });
      setBubbleState("falling");
    },
    [diffId, dirMode],
  );

  const nextRound = useCallback(() => {
    if (theme) spawn(theme);
  }, [theme, spawn]);

  const startGame = useCallback(
    (t: Theme) => {
      const cfg = DIFFICULTIES[diffId];
      setTheme(t);
      setScore(0);
      setLives(cfg.lives);
      setMaxLives(cfg.lives);
      setStreak(0);
      roundCountRef.current = 0;
      gameOverRef.current = false;
      lastWordRef.current = "";
      statsRef.current = { seen: 0, correct: 0, missed: [] };
      setPhase("playing");
      spawn(t);
    },
    [diffId, spawn],
  );

  // ---- resolve a round (correct / wrong / miss) -------------------------
  const resolveRound = useCallback(
    (type: FeedbackType, typed: string) => {
      if (!round) return;
      statsRef.current.seen += 1;
      if (type === "correct") {
        statsRef.current.correct += 1;
        const pts = 10 + Math.min(streak, 10);
        setScore((s) => s + pts);
        setStreak((st) => st + 1);
      } else {
        statsRef.current.missed.push({ word: round.word, dir: round.dir, type });
        setStreak(0);
        setLives((l) => {
          const nl = l - 1;
          gameOverRef.current = nl <= 0;
          return nl;
        });
      }
      setFeedback({ type, word: round.word, dir: round.dir, typed });
      setBubbleState("feedback");
    },
    [round, streak],
  );

  // Keep the latest-value refs current after every render.
  useEffect(() => {
    beepRef.current = beep;
    speakBgRef.current = speakBg;
    resolveRoundRef.current = resolveRound;
    nextRoundRef.current = nextRound;
    scoreRef.current = score;
  });

  // ---- falling animation (runs while falling AND while answering) -------
  useEffect(() => {
    if (phase !== "playing" || bubbleState === "feedback") return;
    let raf = 0;
    let last: number | null = null;
    const step = (ts: number) => {
      const area = playRef.current;
      if (!area) {
        raf = requestAnimationFrame(step);
        return;
      }
      if (last === null) last = ts;
      const dt = Math.min((ts - last) / 1000, 0.05);
      last = ts;
      const floor = area.clientHeight - BUBBLE;
      const next = yRef.current + speedRef.current * dt;
      if (next >= floor) {
        yRef.current = floor;
        setY(floor);
        beepRef.current(150, 0.3, "sawtooth", 0.22);
        resolveRoundRef.current("miss", "");
        return;
      }
      yRef.current = next;
      setY(next);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase, bubbleState, round]);

  // ---- feedback → next round / game over --------------------------------
  useEffect(() => {
    if (bubbleState !== "feedback" || !feedback) return;
    const sp = setTimeout(() => speakBgRef.current(feedback.word.cyr), 250);
    const dur = feedback.type === "correct" ? 950 : 2000;
    const t = setTimeout(() => {
      if (gameOverRef.current) {
        setSummary({
          seen: statsRef.current.seen,
          correct: statsRef.current.correct,
          missed: [...statsRef.current.missed],
        });
        setBest((b) => {
          const nb = Math.max(b, scoreRef.current);
          localStorage.setItem("bulgapop-best", String(nb));
          return nb;
        });
        setPhase("gameover");
      } else nextRoundRef.current();
    }, dur);
    return () => {
      clearTimeout(t);
      clearTimeout(sp);
    };
  }, [bubbleState, feedback]);

  // ---- focus input ------------------------------------------------------
  useEffect(() => {
    if (bubbleState === "answering") inputRef.current?.focus();
  }, [bubbleState]);

  // ---- actions ----------------------------------------------------------
  const popBubble = useCallback(() => {
    if (bubbleState !== "falling" || !round) return;
    beep(680, 0.12, "sine", 0.2);
    // Speak the prompt only when Bulgarian is the prompt (won't spoil EN→BG).
    if (round.dir === "bg2en") speakBg(round.word.cyr);
    setBubbleState("answering");
  }, [bubbleState, round, beep, speakBg]);

  const submit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (bubbleState !== "answering" || !round) return;
      if (!input.trim()) return; // ignore accidental empty Enter
      const expected = round.dir === "en2bg" ? round.word.bg : round.word.en;
      const ok = matches(input, expected);
      if (ok) {
        beep(660, 0.1, "triangle", 0.18);
        setTimeout(() => beep(990, 0.14, "triangle", 0.18), 90);
      } else {
        beep(150, 0.3, "sawtooth", 0.22);
      }
      resolveRound(ok ? "correct" : "wrong", input);
    },
    [bubbleState, round, input, beep, resolveRound],
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (!m) window.speechSynthesis?.cancel();
      return !m;
    });
  }, []);

  const quitToMenu = useCallback(() => {
    window.speechSynthesis?.cancel();
    setPhase("menu");
    setRound(null);
    setBubbleState("falling");
  }, []);

  // ---- derived ----------------------------------------------------------
  const prompt = round
    ? round.dir === "en2bg"
      ? round.word.en
      : round.word.bg
    : "";
  const askLabel = round?.dir === "en2bg" ? "type in Bulgarian" : "type in English";
  const accuracy =
    summary.seen > 0 ? Math.round((summary.correct / summary.seen) * 100) : 0;
  const uniqueMissed = dedupeMissed(summary.missed);

  return (
    <main className={styles.shell}>
      <DecorBubbles />

      {phase === "menu" && (
        <section className={styles.menu} data-testid="menu">
          <p className={styles.kicker}>пук! · pop &amp; learn</p>
          <h1 className={styles.title}>
            Bulga<span className={styles.pop}>Pop</span>
          </h1>
          <p className={styles.tagline}>
            Bubbles fall and keep dropping while you answer. Pop one, type the
            word before it hits the bottom. Don&apos;t let them through.
          </p>
          <div className={styles.flagRule} aria-hidden />

          <div className={styles.options}>
            <div className={styles.optGroup}>
              <span className={styles.optLabel}>Difficulty</span>
              <div className={styles.segmented}>
                {(Object.keys(DIFFICULTIES) as DiffId[]).map((id) => (
                  <button
                    key={id}
                    className={`${styles.seg} ${diffId === id ? styles.segOn : ""}`}
                    aria-pressed={diffId === id}
                    onClick={() => setDiffId(id)}
                  >
                    <span>{DIFFICULTIES[id].label}</span>
                    <small>{DIFFICULTIES[id].sub}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.optGroup}>
              <span className={styles.optLabel}>Direction</span>
              <div className={styles.segmented}>
                {DIRECTIONS.map((d) => (
                  <button
                    key={d.id}
                    className={`${styles.seg} ${dirMode === d.id ? styles.segOn : ""}`}
                    aria-pressed={dirMode === d.id}
                    onClick={() => setDirMode(d.id)}
                  >
                    <span>{d.label}</span>
                    <small>{d.sub}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <h2 className={styles.pickLabel}>Pick a theme to start</h2>
          <div className={styles.themeGrid}>
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={styles.themeCard}
                style={{ "--hue": t.hue } as React.CSSProperties}
                onClick={() => startGame(t)}
              >
                <span className={styles.themeEmoji}>{t.emoji}</span>
                <span className={styles.themeName}>{t.name}</span>
                <span className={styles.themeCount}>{t.words.length} words</span>
              </button>
            ))}
          </div>
          {best > 0 && <p className={styles.bestLine}>Best score: {best}</p>}
        </section>
      )}

      {phase === "playing" && theme && (
        <section className={styles.game}>
          <header className={styles.hud}>
            <button className={styles.quit} onClick={quitToMenu}>
              ‹ menu
            </button>
            <div className={styles.themeTag}>
              <span>{theme.emoji}</span>
              {theme.name}
            </div>
            <div className={styles.scoreBox}>
              <span className={styles.scoreNum} data-testid="score">
                {score}
              </span>
              <span className={styles.scoreLabel}>score</span>
            </div>
            <div className={styles.lives} data-testid="lives" data-lives={lives}>
              {Array.from({ length: maxLives }).map((_, i) => (
                <span
                  key={i}
                  className={`${styles.life} ${i < lives ? "" : styles.lifeOff}`}
                >
                  {i < lives ? "🫧" : "·"}
                </span>
              ))}
            </div>
            <button
              className={styles.mute}
              onClick={toggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? "🔇" : "🔊"}
            </button>
          </header>

          {streak >= 2 && bubbleState !== "feedback" && (
            <div className={styles.streak}>🔥 {streak} streak</div>
          )}

          <div className={styles.play} ref={playRef} data-testid="play">
            {round && bubbleState !== "feedback" && (
              <button
                key={round.id}
                className={`${styles.bubble} ${styles[round.color]} ${
                  bubbleState === "answering" ? styles.bubbleActive : ""
                }`}
                style={{ left: `${round.x}%`, top: `${y}px` }}
                onClick={popBubble}
                aria-label="Pop the bubble"
                data-testid="bubble"
                data-state={bubbleState}
                disabled={bubbleState !== "falling"}
              >
                <span className={styles.gloss} aria-hidden />
                {bubbleState === "falling" && <span className={styles.q}>?</span>}
              </button>
            )}

            {feedback && bubbleState === "feedback" && (
              <div
                className={`${styles.feedback} ${styles[`fb_${feedback.type}`]}`}
                data-testid="feedback"
                data-feedback={feedback.type}
              >
                <span className={styles.fbBadge}>
                  {feedback.type === "correct"
                    ? "✓ pop!"
                    : feedback.type === "miss"
                      ? "dropped!"
                      : "not quite"}
                </span>
                <span className={styles.fbEn}>{feedback.word.en}</span>
                <span className={styles.fbBgRow}>
                  <span className={styles.fbBg}>{feedback.word.bg}</span>
                  {ttsAvailable() && (
                    <button
                      className={styles.speakSm}
                      onClick={() => speakBg(feedback.word.cyr)}
                      aria-label="Hear it"
                      type="button"
                    >
                      🔊
                    </button>
                  )}
                </span>
                <span className={styles.fbCyr}>{feedback.word.cyr}</span>
                {feedback.type === "wrong" && feedback.typed && (
                  <span className={styles.fbTyped}>you wrote: {feedback.typed}</span>
                )}
              </div>
            )}
          </div>

          <div className={styles.dock}>
            {bubbleState === "falling" && (
              <p className={styles.hint}>🫧 Click the bubble to pop it — quick!</p>
            )}
            {bubbleState === "answering" && round && (
              <div className={styles.answer}>
                <div className={styles.promptRow}>
                  <span className={styles.askLabel}>{askLabel}</span>
                  <span className={styles.prompt} data-testid="prompt">
                    {prompt}
                  </span>
                  {round.dir === "bg2en" && ttsAvailable() && (
                    <button
                      className={styles.speakSm}
                      onClick={() => speakBg(round.word.cyr)}
                      aria-label="Hear it"
                      type="button"
                    >
                      🔊
                    </button>
                  )}
                </div>
                <form onSubmit={submit} className={styles.answerForm}>
                  <input
                    ref={inputRef}
                    className={styles.input}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="type here…"
                    data-testid="answer-input"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  <button type="submit" className={styles.go}>
                    pop ✓
                  </button>
                </form>
              </div>
            )}
            {bubbleState === "feedback" && (
              <p className={styles.hint}>next bubble incoming…</p>
            )}
          </div>
        </section>
      )}

      {phase === "gameover" && theme && (
        <section className={styles.menu} data-testid="gameover">
          <p className={styles.kicker}>game over</p>
          <h1 className={styles.title}>
            {score >= best && score > 0 ? "New best! 🎉" : "Nice run!"}
          </h1>
          <div className={styles.finalScore}>{score}</div>

          <div className={styles.statRow}>
            <div className={styles.statCard}>
              <span className={styles.statNum}>{best}</span>
              <span className={styles.statLbl}>best</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statNum}>{accuracy}%</span>
              <span className={styles.statLbl}>accuracy</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statNum}>{summary.seen}</span>
              <span className={styles.statLbl}>words seen</span>
            </div>
          </div>

          {uniqueMissed.length > 0 && (
            <div className={styles.missedBox}>
              <h3 className={styles.missedTitle}>Words to review</h3>
              <ul className={styles.missedList}>
                {uniqueMissed.slice(0, 12).map((m) => (
                  <li key={m.word.en} className={styles.missedItem}>
                    <span className={styles.missedEn}>{m.word.en}</span>
                    <span className={styles.missedArrow}>→</span>
                    <span className={styles.missedBg}>{m.word.bg}</span>
                    <span className={styles.missedCyr}>{m.word.cyr}</span>
                  </li>
                ))}
              </ul>
              {uniqueMissed.length > 12 && (
                <p className={styles.missedMore}>
                  +{uniqueMissed.length - 12} more
                </p>
              )}
            </div>
          )}

          <div className={styles.flagRule} aria-hidden />
          <div className={styles.endButtons}>
            <button className={styles.playAgain} onClick={() => startGame(theme)}>
              Play again
            </button>
            <button className={styles.toMenu} onClick={quitToMenu}>
              Change setup
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function dedupeMissed(missed: Missed[]): Missed[] {
  const seen = new Set<string>();
  const out: Missed[] = [];
  for (const m of missed) {
    if (seen.has(m.word.en)) continue;
    seen.add(m.word.en);
    out.push(m);
  }
  return out;
}

function DecorBubbles() {
  const specs = [
    { left: "8%", size: 90, dur: 17, delay: 0, hue: "var(--pop-pink)" },
    { left: "22%", size: 54, dur: 13, delay: 4, hue: "var(--pop-aqua)" },
    { left: "40%", size: 120, dur: 21, delay: 2, hue: "var(--pop-violet)" },
    { left: "62%", size: 70, dur: 15, delay: 6, hue: "var(--pop-yellow)" },
    { left: "78%", size: 100, dur: 19, delay: 1, hue: "var(--pop-pink)" },
    { left: "90%", size: 46, dur: 12, delay: 3, hue: "var(--pop-aqua)" },
  ];
  return (
    <div className={styles.decor} aria-hidden>
      {specs.map((s, i) => (
        <span
          key={i}
          className={styles.decorBubble}
          style={{
            left: s.left,
            width: s.size,
            height: s.size,
            background: `radial-gradient(circle at 32% 28%, #ffffffcc, ${s.hue} 70%)`,
            animationDuration: `${s.dur}s`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
