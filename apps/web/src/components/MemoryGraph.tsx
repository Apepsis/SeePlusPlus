import { useMemo } from "react";
import { deriveMemoryGraph, layoutMemoryGraph } from "@seeplusplus/graph-engine";
import type { ExecutionStep } from "@seeplusplus/trace-schema";

export function MemoryGraph({ step }: { step: ExecutionStep }) {
  const layout = useMemo(() => layoutMemoryGraph(deriveMemoryGraph(step), undefined), [step]);
  if (!layout.nodes.length)
    return <div className="empty-state graph-empty">No pointer-connected memory objects yet.</div>;
  return (
    <div className="graph-scroll">
      <svg
        className="memory-graph"
        viewBox={`0 0 ${Math.max(layout.width + 80, 400)} ${Math.max(layout.height + 80, 260)}`}
        role="img"
        aria-label="Pointer and heap graph"
      >
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" />
          </marker>
          <marker
            id="arrow-danger"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 z" />
          </marker>
        </defs>
        {layout.edges.map((edge) => {
          const from = layout.nodes.find((node) => node.id === edge.from);
          const to = layout.nodes.find((node) => node.id === edge.to);
          if (!from || !to) return null;
          return (
            <g key={edge.id}>
              <path
                className={`graph-edge ${edge.state}`}
                d={`M ${from.x + from.width / 2} ${from.y} C ${from.x + from.width / 2 + 35} ${from.y}, ${to.x - to.width / 2 - 35} ${to.y}, ${to.x - to.width / 2} ${to.y}`}
                markerEnd={`url(#${edge.state === "dangling" ? "arrow-danger" : "arrow"})`}
              />
              <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 8}>
                {edge.label}
              </text>
            </g>
          );
        })}
        {layout.nodes.map((node) => (
          <g
            className={`graph-node ${node.kind} ${node.state ?? ""}`}
            transform={`translate(${node.x - node.width / 2},${node.y - node.height / 2})`}
            key={node.id}
          >
            <rect width={node.width} height={node.height} rx="12" />
            <text x="14" y="26" className="node-label">
              {node.label}
            </text>
            <text x="14" y="47" className="node-subtitle">
              {node.subtitle}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
