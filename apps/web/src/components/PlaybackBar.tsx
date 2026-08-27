import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect } from "react";
import { useAppStore } from "../store.js";

export function PlaybackBar() {
  const { trace, stepIndex, setStep, playing, setPlaying, speed, setSpeed } = useAppStore();
  const last = Math.max(0, (trace?.steps.length ?? 1) - 1);
  useEffect(() => {
    if (!playing || !trace) return;
    const timer = window.setInterval(() => {
      const state = useAppStore.getState();
      if (state.stepIndex >= last) {
        state.setPlaying(false);
        return;
      }
      state.setStep(state.stepIndex + 1);
    }, 850 / speed);
    return () => clearInterval(timer);
  }, [playing, speed, trace, last]);
  return (
    <div className="playback-bar">
      <div className="play-controls">
        <button
          onClick={() => setStep(stepIndex - 1)}
          disabled={stepIndex === 0}
          aria-label="Previous step"
        >
          <SkipBack size={18} />
        </button>
        <button
          className="play-button"
          onClick={() => setPlaying(!playing)}
          disabled={!trace?.steps.length}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause size={19} /> : <Play size={19} />}
        </button>
        <button
          onClick={() => setStep(stepIndex + 1)}
          disabled={stepIndex >= last}
          aria-label="Next step"
        >
          <SkipForward size={18} />
        </button>
      </div>
      <span className="step-count">
        STEP <strong>{stepIndex + 1}</strong> / {last + 1}
      </span>
      <input
        aria-label="Execution step"
        type="range"
        min="0"
        max={last}
        value={stepIndex}
        onChange={(event) => setStep(Number(event.target.value))}
      />
      <select
        aria-label="Playback speed"
        value={speed}
        onChange={(event) => setSpeed(Number(event.target.value))}
      >
        <option value="0.5">0.5×</option>
        <option value="1">1×</option>
        <option value="2">2×</option>
        <option value="4">4×</option>
      </select>
    </div>
  );
}
