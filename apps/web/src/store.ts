import { create } from "zustand";
import { examples } from "@seeplusplus/test-fixtures";
import { RunResponseSchema, type Finding, type ProgramTrace } from "@seeplusplus/trace-schema";

type RuntimeTab = "memory" | "call-tree" | "lifetimes";
interface AppState {
  code: string;
  selectedExample: string;
  trace?: ProgramTrace;
  findings: Finding[];
  stepIndex: number;
  playing: boolean;
  speed: number;
  runtimeTab: RuntimeTab;
  status: "idle" | "running" | "complete" | "error";
  message?: string;
  setCode(code: string): void;
  selectExample(slug: string): void;
  setStep(index: number): void;
  setPlaying(value: boolean): void;
  setSpeed(value: number): void;
  setRuntimeTab(tab: RuntimeTab): void;
  run(): Promise<void>;
}

const initial = examples[2] ?? examples[0]!;
const demoMode = import.meta.env.VITE_DEMO_MODE === "true" || !import.meta.env.VITE_API_URL;
const apiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export const useAppStore = create<AppState>((set, get) => ({
  code: initial.code,
  selectedExample: initial.slug,
  trace: initial.trace,
  findings: [],
  stepIndex: 0,
  playing: false,
  speed: 1,
  runtimeTab: "memory",
  status: "complete",
  setCode: (code) => set({ code, playing: false }),
  selectExample: (slug) => {
    const example = examples.find((item) => item.slug === slug);
    if (example)
      set({
        selectedExample: slug,
        code: example.code,
        trace: example.trace,
        findings: [],
        stepIndex: 0,
        playing: false,
        status: "complete",
        message: undefined,
      });
  },
  setStep: (index) => {
    const trace = get().trace;
    if (trace)
      set({ stepIndex: Math.max(0, Math.min(index, Math.max(0, trace.steps.length - 1))) });
  },
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setRuntimeTab: (runtimeTab) => set({ runtimeTab }),
  run: async () => {
    const state = get();
    const matching = examples.find((example) => example.code.trim() === state.code.trim());
    if (demoMode) {
      if (matching)
        set({
          trace: matching.trace,
          selectedExample: matching.slug,
          stepIndex: 0,
          status: "complete",
          message:
            "Static Pages demo: showing an explicitly labelled golden fixture. Start the local runner for real execution.",
        });
      else
        set({
          status: "error",
          message:
            "Custom C++ cannot execute on static GitHub Pages. Run the Docker stack locally to compile this code.",
        });
      return;
    }
    set({ status: "running", playing: false, message: undefined });
    try {
      const response = await fetch(`${apiUrl}/v1/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: state.code, languageMode: "cpp20", stdin: "" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? body.error ?? "Run failed");
      const parsed = RunResponseSchema.parse(body);
      set({
        trace: parsed.trace,
        findings: parsed.findings ?? [],
        stepIndex: 0,
        status: "complete",
        message: parsed.cacheHit ? "Loaded a verified cached trace." : undefined,
      });
    } catch (error) {
      set({ status: "error", message: (error as Error).message });
    }
  },
}));

export { demoMode };
