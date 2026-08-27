import { CircleDot } from "lucide-react";
import type { ExecutionStep, VariableBinding } from "@seeplusplus/trace-schema";
import { renderValue } from "../lib/values.js";

function Variable({ binding }: { binding: VariableBinding }) {
  const pointerState =
    binding.value.kind === "pointer" || binding.value.kind === "reference"
      ? binding.value.state
      : undefined;
  return (
    <div className={`variable-row ${pointerState ?? ""}`}>
      <span className="variable-type">{binding.declaredType}</span>
      <strong>{binding.name}</strong>
      <span className="equals">=</span>
      <code>{renderValue(binding.value)}</code>
      {pointerState ? <span className={`state-badge ${pointerState}`}>{pointerState}</span> : null}
    </div>
  );
}

export function StackView({ step }: { step: ExecutionStep }) {
  return (
    <div className="stack-view">
      {step.frames.length === 0 ? (
        <div className="empty-state">No active stack frames at this step.</div>
      ) : (
        step.frames.map((frame, index) => (
          <article className="frame-card" key={frame.frameId}>
            <header>
              <div className="frame-depth">
                <CircleDot size={14} />
                <span>FRAME {step.frames.length - index}</span>
              </div>
              <strong>{frame.function.name}</strong>
              <span className="frame-line">L{frame.location?.line ?? "—"}</span>
            </header>
            <div className="frame-body">
              {[...frame.parameters, ...frame.locals].length ? (
                [...frame.parameters, ...frame.locals].map((binding) => (
                  <Variable binding={binding} key={binding.id} />
                ))
              ) : (
                <span className="muted">No visible variables</span>
              )}
            </div>
          </article>
        ))
      )}
    </div>
  );
}
