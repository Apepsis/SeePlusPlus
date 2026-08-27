import { BookOpen, Github, LoaderCircle, Play, RotateCcw, ShieldCheck } from "lucide-react";
import { examples } from "@seeplusplus/test-fixtures";
import { CodePane } from "./components/CodePane.js";
import { ConsolePanel } from "./components/ConsolePanel.js";
import { PlaybackBar } from "./components/PlaybackBar.js";
import { RuntimePane } from "./components/RuntimePane.js";
import { demoMode, useAppStore } from "./store.js";

export function App() {
  const state = useAppStore();
  const step = state.trace?.steps[state.stepIndex];
  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="./">
          <span className="brand-mark">
            C<span>++</span>
          </span>
          <div>
            <strong>SeePlusPlus</strong>
            <small>runtime, made visible</small>
          </div>
        </a>
        <div className="top-actions">
          <span className={`mode-indicator ${demoMode ? "demo" : "live"}`}>
            <ShieldCheck size={14} />
            {demoMode ? "Static demo" : "Isolated runner"}
          </span>
          <a href="https://github.com/Apepsis/SeePlusPlus" target="_blank" rel="noreferrer">
            <Github size={17} /> GitHub
          </a>
        </div>
      </header>
      <section className="commandbar">
        <div className="example-control">
          <BookOpen size={16} />
          <label htmlFor="example">Example</label>
          <select
            id="example"
            value={state.selectedExample}
            onChange={(event) => state.selectExample(event.target.value)}
          >
            {examples.map((example) => (
              <option value={example.slug} key={example.slug}>
                {example.title}
              </option>
            ))}
          </select>
        </div>
        <div className="run-context">
          <span>{state.trace?.source.languageMode.toUpperCase() ?? "C++20"}</span>
          <span>
            {state.trace?.run.compiler.name} {state.trace?.run.compiler.version}
          </span>
        </div>
        <button className="reset-button" onClick={() => state.selectExample(state.selectedExample)}>
          <RotateCcw size={16} /> Reset
        </button>
        <button
          className="run-button"
          onClick={() => void state.run()}
          disabled={state.status === "running"}
        >
          {state.status === "running" ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <Play size={18} />
          )}{" "}
          {state.status === "running" ? "Tracing…" : "Run code"}
        </button>
      </section>
      {state.message ? <div className={`notice ${state.status}`}>{state.message}</div> : null}
      <div className="workspace-grid">
        <CodePane code={state.code} activeLine={step?.location?.line} onChange={state.setCode} />
        {state.trace && step ? (
          <RuntimePane trace={state.trace} step={step} />
        ) : (
          <section className="runtime-pane panel empty-state">
            Run a program to inspect its runtime state.
          </section>
        )}
      </div>
      {step ? <ConsolePanel step={step} findings={state.findings} onJump={state.setStep} /> : null}
      <PlaybackBar />
    </main>
  );
}
