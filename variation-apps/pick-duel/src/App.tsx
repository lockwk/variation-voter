import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { rounds, archetypeFor, type Option } from "./rounds";
import "./App.css";

type Pick = { roundId: string; option: Option };

const SELECT_DELAY_MS = 550;

export default function App() {
  const [roundIndex, setRoundIndex] = useState(0);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);

  const isFinished = roundIndex >= rounds.length;
  const round = rounds[roundIndex];

  function handlePick(option: Option) {
    if (pendingOptionId) return; // ignore double-taps while animating
    setPendingOptionId(option.id);
    window.setTimeout(() => {
      setPicks((prev) => [...prev, { roundId: round.id, option }]);
      setRoundIndex((i) => i + 1);
      setPendingOptionId(null);
    }, SELECT_DELAY_MS);
  }

  function reset() {
    setRoundIndex(0);
    setPicks([]);
    setPendingOptionId(null);
  }

  return (
    <div className="app">
      <div className="glow" aria-hidden="true" />

      <header className="app-header">
        <span className="eyebrow">Pick your vibe</span>
        <div className="progress" role="progressbar" aria-valuenow={Math.min(roundIndex, rounds.length)} aria-valuemax={rounds.length}>
          {rounds.map((r, i) => (
            <span key={r.id} className={`dot ${i < roundIndex || isFinished ? "dot-filled" : i === roundIndex ? "dot-active" : ""}`} />
          ))}
        </div>
      </header>

      <main className="stage">
        <AnimatePresence mode="wait">
          {!isFinished ? (
            <motion.div
              key={round.id}
              className="round"
              initial={{ opacity: 0, x: 48 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -48 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
            >
              <h1 className="prompt">{round.prompt}</h1>
              <div className="options">
                {round.options.map((option) => {
                  const isPending = pendingOptionId === option.id;
                  const isDimmed = pendingOptionId !== null && !isPending;
                  return (
                    <motion.button
                      key={option.id}
                      type="button"
                      className="option"
                      onClick={() => handlePick(option)}
                      disabled={pendingOptionId !== null}
                      animate={
                        isPending
                          ? { scale: 1.06, borderColor: "#c084fc", boxShadow: "0 0 0 3px rgba(192,132,252,0.35), 0 12px 32px rgba(192,132,252,0.25)" }
                          : { scale: 1, borderColor: "rgba(255,255,255,0.08)", boxShadow: "0 0 0 0 rgba(192,132,252,0)" }
                      }
                      style={{ opacity: isDimmed ? 0.35 : 1 }}
                      whileHover={pendingOptionId === null ? { scale: 1.02, y: -2 } : undefined}
                      whileTap={pendingOptionId === null ? { scale: 0.97 } : undefined}
                      transition={{ type: "spring", stiffness: 400, damping: 22 }}
                    >
                      <span className="option-emoji">{option.emoji}</span>
                      <span className="option-label">{option.label}</span>
                    </motion.button>
                  );
                })}
              </div>
              <span className="versus">or</span>
            </motion.div>
          ) : (
            <ResultsScreen key="results" picks={picks} onReset={reset} />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function ResultsScreen({ picks, onReset }: { picks: Pick[]; onReset: () => void }) {
  const archetype = archetypeFor(picks.map((p) => p.option.tag));

  return (
    <motion.div
      className="results"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
    >
      <motion.span
        className="eyebrow"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        Your vibe is
      </motion.span>
      <motion.h1
        className="archetype-title"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.15 }}
      >
        {archetype.title}
      </motion.h1>
      <p className="archetype-blurb">{archetype.blurb}</p>

      <motion.ul
        className="recap"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.06, delayChildren: 0.35 } },
        }}
      >
        {picks.map((pick) => (
          <motion.li
            key={pick.roundId}
            className="recap-item"
            variants={{
              hidden: { opacity: 0, x: -12 },
              show: { opacity: 1, x: 0 },
            }}
          >
            <span className="recap-emoji">{pick.option.emoji}</span>
            <span>{pick.option.label}</span>
          </motion.li>
        ))}
      </motion.ul>

      <motion.button
        type="button"
        className="play-again"
        onClick={onReset}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.96 }}
      >
        Play again
      </motion.button>
    </motion.div>
  );
}
