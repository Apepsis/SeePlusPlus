import { AlertTriangle, Terminal } from "lucide-react";
import type { ExecutionStep, Finding } from "@seeplusplus/trace-schema";

export function ConsolePanel({
  step,
  findings,
  onJump,
}: {
  step: ExecutionStep;
  findings: Finding[];
  onJump(step: number): void;
}) {
  return (
    <section className="console-panel panel">
      <div className="console-output">
        <div className="section-label">
          <Terminal size={14} /> CONSOLE
        </div>
        <pre>
          {step.io.stdout || step.io.stderr ? (
            <>
              {step.io.stdout}
              <span className="stderr">{step.io.stderr}</span>
            </>
          ) : (
            <span className="muted">Program output appears here.</span>
          )}
        </pre>
      </div>
      <div className="findings">
        <div className="section-label">
          <AlertTriangle size={14} /> DIAGNOSTICS <span>{findings.length}</span>
        </div>
        {findings.length ? (
          findings.map((finding) => (
            <button
              className={`finding ${finding.severity}`}
              key={finding.id}
              onClick={() => onJump(finding.firstStep)}
            >
              <strong>{finding.title}</strong>
              <span>{finding.summary}</span>
              <small>
                {finding.confidence} confidence · step {finding.firstStep + 1}
              </small>
            </button>
          ))
        ) : (
          <div className="no-findings">No analyzer findings at this run.</div>
        )}
      </div>
    </section>
  );
}
