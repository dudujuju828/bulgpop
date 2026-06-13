"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { THEMES, matches, pickIndex, type Theme, type Word } from "@/lib/vocab";
import styles from "./Game.module.css";

const BUBBLE = 132; // bubble diameter in px
const COLORS = ["pink", "yellow", "aqua", "violet"] as const;

const DIFFICULTIES = {
  easy: { id: "easy", label: "Easy", lives: 5, base: 40, ramp: 3, max: 150, sub: "slow · 5 lives" },
  normal: { id: "normal", label: "Normal", lives: 3, base: 55, ramp: 5, max: 235, sub: "medium · 3 lives" },
  hard: { id: "hard", label: "Hard", lives: 2, base: 80, ramp: 8, max: 320, sub: "fast · 2 lives" },
} as const;
type DiffId = keyof typeof DIFFICULTIES;

// Fall duration presets: user-facing labels map to target seconds for a bubble
// to cross the play area. These override the difficulty's `base` px/s value.
const FALL_PRESETS = {
  relaxed: { label: "Relaxed", sub: "~18s", seconds: 18 },
  normal:  { label: "Normal",  sub: "~10s", seconds: 10 },
  brisk:   { label: "Brisk",   sub: "~6s",  seconds: 6  },
  fast:    { label: "Fast",    sub: "~4s",  seconds: 4  },
} as const;
type FallPreset = keyof typeof FALL_PRESETS;

const DIRECTIONS = [
  { id: "en2bg", label: "EN → BG", sub: "type Bulgarian" },
  { id: "bg2en", label: "BG → EN", sub: "type English" },
  { id: "mixed", label: "Mixed", sub: "both ways" },
] as const;
type DirMode = (typeof DIRECTIONS)[number]["id"];
type Dir = "en2bg" | "bg2en";

type Phase = "menu" | "playing" | "gameover";
// "correcting" = player must retype a word they got wrong before continuing.
type BubbleState = "falling" | "answering" | "feedback" | "correcting";
type FeedbackType = "correct" | "wrong" | "miss";

// Adaptive selection weights: missed words climb toward MAX so they recur.
const WEIGHT_BASE = 1;
const WEIGHT_MAX = 6;
const WEIGHT_ON_MISS = 2;

type Round = {
  id: number;
  word: Word;
  x: number; // percent
  color: (typeof COLORS)[number];
  dir: Dir;
  size: number; // bubble diameter (px) — scales with prompt length
  font: number; // prompt font-size (px) inside the bubble
};

// The prompt now lives *on* the bubble (so the on-screen keyboard can't hide
// it on phones/tablets). Bigger prompts get a bigger bubble + smaller text.
function bubbleMetrics(text: string): { size: number; font: number } {
  const len = text.trim().length;
  if (len <= 4) return { size: 124, font: 27 };
  if (len <= 7) return { size: 138, font: 23 };
  if (len <= 11) return { size: 154, font: 19 };
  if (len <= 16) return { size: 172, font: 17 };
  if (len <= 22) return { size: 192, font: 15 };
  return { size: 208, font: 14 };
}

type Feedback = { type: FeedbackType; word: Word; dir: Dir; typed: string };
type Missed = { word: Word; dir: Dir; type: "wrong" | "miss" };

export default function Game() {
  const [phase, setPhase] = useState<Phase>("menu");
  const [theme, setTheme] = useState<Theme | null>(null);
  const [diffId, setDiffId] = useState<DiffId>("normal");
  const [dirMode, setDirMode] = useState<DirMode>("en2bg");
  const [fallPreset, setFallPreset] = useState<FallPreset>("normal");
  const [steadySpeed, setSteadySpeed] = useState(false);
  const [zenMode, setZenMode] = useState(false);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [lives, setLives] = useState(3);
  const [maxLives, setMaxLives] = useState(3);
  const [streak, setStreak] = useState(0);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hintText, setHintText] = useState<string | null>(null);

  const [summary, setSummary] = useState<{
    seen: number;
    correct: number;
    missed: Missed[];
  }>({ seen: 0, correct: 0, missed: [] });

  const [round, setRound] = useState<Round | null>(null);
  const [bubbleState, setBubbleState] = useState<BubbleState>("falling");
  const [y, setY] = useState(-BUBBLE);
  const [input, setInput] = useState("");
  const [correctionInput, setCorrectionInput] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const playRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const correctionRef = useRef<HTMLInputElement>(null);
  const sizeRef = useRef(BUBBLE); // current bubble diameter (for floor calc)
  const weightsRef = useRef<Map<string, number>>(new Map());
  const yRef = useRef(-BUBBLE);
  const speedRef = useRef(55);
  const roundCountRef = useRef(0);
  const gameOverRef = useRef(false);
  const lastWordRef = useRef<string>("");
  const audioRef = useRef<AudioContext | null>(null);
  const bgVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const pausedRef = useRef(false);
  const zenModeRef = useRef(false);
  const fallPresetRef = useRef<FallPreset>("normal");
  const steadyRef = useRef(false);
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

  // ---- best score + persisted settings ----------------------------------
  useEffect(() => {
    const saved = Number(localStorage.getItem("bulgapop-best") || 0);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe load
    if (saved) setBest(saved);

    const preset = localStorage.getItem("bulgapop-fall-preset") as FallPreset | null;
    if (preset && preset in FALL_PRESETS) setFallPreset(preset);

    const steady = localStorage.getItem("bulgapop-steady-speed");
    if (steady !== null) setSteadySpeed(steady === "true");

    const zen = localStorage.getItem("bulgapop-zen-mode");
    if (zen !== null) setZenMode(zen === "true");
  }, []);

  // Persist settings when they change.
  useEffect(() => { localStorage.setItem("bulgapop-fall-preset", fallPreset); }, [fallPreset]);
  useEffect(() => { localStorage.setItem("bulgapop-steady-speed", String(steadySpeed)); }, [steadySpeed]);
  useEffect(() => { localStorage.setItem("bulgapop-zen-mode", String(zenMode)); }, [zenMode]);

  // ---- keep the game sized to the *visible* viewport --------------------
  // When the on-screen keyboard opens (iPad/phone portrait) the visual
  // viewport shrinks; tracking it keeps the falling bubble and the input on
  // screen instead of being hidden behind the keyboard.
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const update = () => {
      const h = vv ? vv.height : window.innerHeight;
      root.style.setProperty("--vvh", `${Math.round(h)}px`);
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  // ---- rounds -----------------------------------------------------------
  const spawn = useCallback(
    (t: Theme) => {
      const cfg = DIFFICULTIES[diffId];
      roundCountRef.current += 1;

      // Compute base speed from the user's target fall duration. Fall back to
      // 450 px for the first bubble (before the play area is measured).
      const areaH = playRef.current?.clientHeight ?? 450;
      const fallSecs = FALL_PRESETS[fallPresetRef.current].seconds;
      const baseSpeed = areaH / fallSecs;
      const rampPerRound = steadyRef.current ? 0 : cfg.ramp;
      const maxSpeed = steadyRef.current ? baseSpeed : cfg.max;
      speedRef.current = Math.min(
        baseSpeed + roundCountRef.current * rampPerRound,
        maxSpeed,
      );

      // Weighted pick: struggled words weigh more; the previous word is
      // excluded (weight 0) so the same bubble never appears twice in a row.
      const weights = t.words.map((w) => {
        if (w.en === lastWordRef.current && t.words.length > 1) return 0;
        return weightsRef.current.get(w.en) ?? WEIGHT_BASE;
      });
      const word = t.words[pickIndex(weights)];
      lastWordRef.current = word.en;

      const dir: Dir =
        dirMode === "mixed"
          ? Math.random() < 0.5
            ? "en2bg"
            : "bg2en"
          : dirMode;

      const promptText = dir === "en2bg" ? word.en : word.bg;
      const { size, font } = bubbleMetrics(promptText);
      sizeRef.current = size;

      yRef.current = -size;
      setY(-size);
      setInput("");
      setHintText(null);
      setFeedback(null);
      setRound({
        id: roundCountRef.current,
        word,
        x: 16 + Math.random() * 68,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        dir,
        size,
        font,
      });
      setBubbleState("answering");
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
      weightsRef.current = new Map();
      statsRef.current = { seen: 0, correct: 0, missed: [] };
      setPaused(false);
      setPhase("playing");
      spawn(t);
    },
    [diffId, spawn],
  );

  // ---- resolve a round (correct / wrong / miss) -------------------------
  const resolveRound = useCallback(
    (type: FeedbackType, typed: string) => {
      if (!round) return;
      const en = round.word.en;
      const w = weightsRef.current;
      statsRef.current.seen += 1;
      setFeedback({ type, word: round.word, dir: round.dir, typed });

      if (type === "correct") {
        statsRef.current.correct += 1;
        w.set(en, Math.max(WEIGHT_BASE, (w.get(en) ?? WEIGHT_BASE) - 1));
        const pts = 10 + Math.min(streak, 10);
        setScore((s) => s + pts);
        setStreak((st) => st + 1);
        setBubbleState("feedback");
        return;
      }

      // wrong or miss: boost word weight; in Zen mode just show feedback (no
      // life loss); otherwise lose a life and force a retype.
      statsRef.current.missed.push({ word: round.word, dir: round.dir, type });
      w.set(en, Math.min(WEIGHT_MAX, (w.get(en) ?? WEIGHT_BASE) + WEIGHT_ON_MISS));
      setStreak(0);
      if (zenModeRef.current) {
        setBubbleState("feedback");
        return;
      }
      const over = lives - 1 <= 0;
      gameOverRef.current = over;
      setLives(lives - 1);
      if (over) {
        setBubbleState("feedback");
      } else {
        setCorrectionInput("");
        setBubbleState("correcting");
      }
    },
    [round, streak, lives],
  );

  // Keep the latest-value refs current after every render.
  useEffect(() => {
    beepRef.current = beep;
    speakBgRef.current = speakBg;
    resolveRoundRef.current = resolveRound;
    nextRoundRef.current = nextRound;
    scoreRef.current = score;
    pausedRef.current = paused;
    zenModeRef.current = zenMode;
    fallPresetRef.current = fallPreset;
    steadyRef.current = steadySpeed;
  });

  // ---- falling animation (runs while falling AND while answering) -------
  useEffect(() => {
    if (phase !== "playing") return;
    if (bubbleState !== "falling" && bubbleState !== "answering") return;
    let raf = 0;
    let last: number | null = null;
    const step = (ts: number) => {
      const area = playRef.current;
      if (!area) {
        raf = requestAnimationFrame(step);
        return;
      }
      if (pausedRef.current) {
        last = ts; // reset so there's no dt jump on resume
        raf = requestAnimationFrame(step);
        return;
      }
      if (last === null) last = ts;
      const dt = Math.min((ts - last) / 1000, 0.05);
      last = ts;
      const floor = Math.max(8, area.clientHeight - sizeRef.current);
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
    // Zen mode gives more reading time on wrong/miss answers.
    const dur = feedback.type === "correct" ? 950 : (zenModeRef.current ? 3200 : 2000);
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

  // ---- focus the active input ------------------------------------------
  useEffect(() => {
    if (bubbleState === "answering") {
      inputRef.current?.focus();
      // After the mobile keyboard animates in, scroll the input into view
      // in case --vvh hasn't fully settled yet.
      setTimeout(
        () => inputRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
        350,
      );
    } else if (bubbleState === "correcting") {
      correctionRef.current?.focus();
      // Scroll the correction form into view within the (overflow-y:auto) feedback panel.
      setTimeout(
        () => correctionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
        350,
      );
    }
  }, [bubbleState]);

  // ---- actions ----------------------------------------------------------
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

  // Retype-to-continue after a wrong/missed word (the answer is shown).
  const submitCorrection = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (bubbleState !== "correcting" || !feedback) return;
      const target =
        feedback.dir === "en2bg" ? feedback.word.bg : feedback.word.en;
      if (matches(correctionInput, target)) {
        beep(660, 0.1, "triangle", 0.18);
        nextRound();
      } else {
        beep(150, 0.22, "sawtooth", 0.18);
        setCorrectionInput("");
        correctionRef.current?.focus();
      }
    },
    [bubbleState, feedback, correctionInput, beep, nextRound],
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (!m) window.speechSynthesis?.cancel();
      return !m;
    });
  }, []);

  const quitToMenu = useCallback(() => {
    window.speechSynthesis?.cancel();
    setPaused(false);
    setPhase("menu");
    setRound(null);
    setBubbleState("falling");
  }, []);

  const togglePause = useCallback(() => setPaused((p) => !p), []);

  const showHint = useCallback(() => {
    if (!round || hintText !== null) return;
    const expected = round.dir === "en2bg" ? round.word.bg : round.word.en;
    setHintText(expected[0] + "…");
    if (!zenMode) setScore((s) => Math.max(0, s - 5));
    beep(440, 0.08, "sine", 0.1);
  }, [round, hintText, zenMode, beep]);

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

          <div className={styles.options}>
            <div className={styles.optGroup}>
              <span className={styles.optLabel}>Fall Speed</span>
              <div className={styles.segmented}>
                {(Object.keys(FALL_PRESETS) as FallPreset[]).map((id) => (
                  <button
                    key={id}
                    className={`${styles.seg} ${fallPreset === id ? styles.segOn : ""}`}
                    aria-pressed={fallPreset === id}
                    onClick={() => setFallPreset(id)}
                    data-testid={`fall-preset-${id}`}
                  >
                    <span>{FALL_PRESETS[id].label}</span>
                    <small>{FALL_PRESETS[id].sub}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.optGroup}>
              <span className={styles.optLabel}>Learning</span>
              <div className={styles.segmented}>
                <button
                  className={`${styles.seg} ${steadySpeed ? styles.segOn : ""}`}
                  aria-pressed={steadySpeed}
                  onClick={() => setSteadySpeed((s) => !s)}
                  data-testid="steady-speed-toggle"
                >
                  <span>Steady</span>
                  <small>no ramp</small>
                </button>
                <button
                  className={`${styles.seg} ${zenMode ? styles.segOn : ""}`}
                  aria-pressed={zenMode}
                  onClick={() => setZenMode((z) => !z)}
                  data-testid="zen-mode-toggle"
                >
                  <span>Zen mode</span>
                  <small>no lives</small>
                </button>
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
            {zenMode ? (
              <div className={styles.zenIndicator} data-testid="lives" data-lives="∞">
                ∞ zen
              </div>
            ) : (
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
            )}
            {bubbleState === "answering" && (
              <button
                className={`${styles.pauseBtn} ${paused ? styles.pauseBtnActive : ""}`}
                onClick={togglePause}
                aria-label={paused ? "Resume" : "Pause"}
                aria-pressed={paused}
                data-testid="pause-btn"
              >
                {paused ? "▶" : "⏸"}
              </button>
            )}
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
            {paused && (
              <div className={styles.pauseOverlay} data-testid="pause-overlay">
                <span>⏸ paused</span>
                <button onClick={togglePause} className={styles.resumeBtn}>
                  resume ▶
                </button>
              </div>
            )}
            {round && bubbleState === "answering" && (
              <div
                key={round.id}
                className={`${styles.bubble} ${styles[round.color]} ${styles.bubbleActive}`}
                style={{
                  left: `${round.x}%`,
                  top: `${y}px`,
                  width: round.size,
                  height: round.size,
                  ["--bubble-font" as string]: `${round.font}px`,
                }}
                aria-label={`Bubble: ${prompt}`}
                data-testid="bubble"
                data-state="answering"
              >
                <span className={styles.gloss} aria-hidden />
                <span className={styles.bubbleWord} data-testid="prompt">
                  {prompt}
                </span>
              </div>
            )}

            {feedback &&
              (bubbleState === "feedback" || bubbleState === "correcting") && (
                <div
                  className={`${styles.feedback} ${styles[`fb_${feedback.type}`]}`}
                  data-testid="feedback"
                  data-feedback={feedback.type}
                  data-mode={bubbleState}
                >
                  <span className={styles.fbBadge}>
                    {feedback.type === "correct"
                      ? "✓ pop!"
                      : feedback.type === "miss"
                        ? "dropped!"
                        : "not quite"}
                  </span>
                  <span className={styles.fbEn} data-testid="fb-en">
                    {feedback.word.en}
                  </span>
                  <span className={styles.fbBgRow}>
                    <span className={styles.fbBg} data-testid="fb-bg">
                      {feedback.word.bg}
                    </span>
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
                    <span className={styles.fbTyped}>
                      you wrote: {feedback.typed}
                    </span>
                  )}

                  {bubbleState === "correcting" && (
                    <form onSubmit={submitCorrection} className={styles.correction}>
                      <span className={styles.correctionLabel}>
                        ✍️ type the {feedback.dir === "en2bg" ? "Bulgarian" : "English"}{" "}
                        to continue
                      </span>
                      <div className={styles.answerForm}>
                        <input
                          ref={correctionRef}
                          className={styles.input}
                          value={correctionInput}
                          onChange={(e) => setCorrectionInput(e.target.value)}
                          placeholder="retype it…"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          data-testid="correction-input"
                        />
                        <button type="submit" className={styles.go}>
                          continue →
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
          </div>

          <div className={styles.dock}>
            {bubbleState === "answering" && round && (
              <div className={styles.answer}>
                <div className={styles.promptRow}>
                  <span className={styles.askLabel}>{askLabel}:</span>
                  <span className={styles.promptMini}>{prompt}</span>
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
                  <button
                    className={styles.hintBtn}
                    onClick={showHint}
                    type="button"
                    data-testid="hint-btn"
                    disabled={hintText !== null}
                  >
                    💡{zenMode ? " hint" : " hint (−5)"}
                  </button>
                </div>
                {hintText && (
                  <span className={styles.hintText} data-testid="hint-text">
                    starts with: <strong>{hintText}</strong>
                  </span>
                )}
                <form onSubmit={submit} className={styles.answerForm}>
                  <input
                    ref={inputRef}
                    className={styles.input}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="pop! type here…"
                    data-testid="answer-input"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    autoFocus
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
            {bubbleState === "correcting" && (
              <p className={styles.hint}>retype the word above to lock it in 🔒</p>
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
                    {ttsAvailable() && (
                      <button
                        className={styles.speakSm}
                        onClick={() => speakBg(m.word.cyr)}
                        type="button"
                        aria-label={`Hear ${m.word.en}`}
                      >
                        🔊
                      </button>
                    )}
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
