import { Boxes, GitBranch, Rows3 } from "lucide-react";
import type { ExecutionStep, ProgramTrace } from "@seeplusplus/trace-schema";
import { useAppStore } from "../store.js";
import { MemoryGraph } from "./MemoryGraph.js";
import { StackView } from "./StackView.js";

export function RuntimePane({ trace, step }: { trace: ProgramTrace; step: ExecutionStep }) {
  const tab = useAppStore((state) => state.runtimeTab);
  const setTab = useAppStore((state) => state.setRuntimeTab);
  return (
    <section className="runtime-pane panel">
      <div className="runtime-tabs" role="tablist">
        <button className={tab === "memory" ? "active" : ""} onClick={() => setTab("memory")}>
          <Boxes size={16} /> Memory
        </button>
        <button className={tab === "call-tree" ? "active" : ""} onClick={() => setTab("call-tree")}>
          <GitBranch size={16} /> Call stack
        </button>
        <button className={tab === "lifetimes" ? "active" : ""} onClick={() => setTab("lifetimes")}>
          <Rows3 size={16} /> Lifetimes
        </button>
        <span className="trace-source">{trace.run.tracer.name}</span>
      </div>
      {tab === "memory" ? (
        <div className="memory-split">
          <div className="stack-column">
            <div className="section-label">STACK</div>
            <StackView step={step} />
          </div>
          <div className="heap-column">
            <div className="section-label">
              HEAP & POINTER GRAPH <span>{step.heap.live.length} live</span>
            </div>
            <MemoryGraph step={step} />
          </div>
        </div>
      ) : null}
      {tab === "call-tree" ? (
        <div className="call-tree">
          {step.frames
            .slice()
            .reverse()
            .map((frame, index) => (
              <div className="call-row" style={{ marginLeft: index * 28 }} key={frame.frameId}>
                <span>{index + 1}</span>
                <strong>{frame.function.name}</strong>
                <code>line {frame.location?.line ?? "—"}</code>
              </div>
            ))}
        </div>
      ) : null}
      {tab === "lifetimes" ? (
        <div className="lifetimes">
          {[
            ...new Map(
              trace.steps
                .flatMap((item) => [...item.heap.live, ...(item.heap.recentlyFreed ?? [])])
                .map((object) => [object.objectId, object]),
            ).values(),
          ].map((object) => (
            <div className="lifetime-row" key={object.objectId}>
              <div>
                <strong>{object.typeName ?? "allocation"}</strong>
                <code>{object.address}</code>
              </div>
              <div className="lifetime-track">
                <span
                  style={{
                    left: `${(object.allocatedAtStep / Math.max(trace.steps.length - 1, 1)) * 100}%`,
                    right: `${100 - ((object.freedAtStep ?? trace.steps.length - 1) / Math.max(trace.steps.length - 1, 1)) * 100}%`,
                  }}
                />
              </div>
              <small>
                {object.freedAtStep === undefined
                  ? "live at exit"
                  : `freed · step ${object.freedAtStep}`}
              </small>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
