import dagre from "@dagrejs/dagre";
import { pointersAtStep } from "@seeplusplus/memory-model";
import type { ExecutionStep, RuntimeValue, VariableBinding } from "@seeplusplus/trace-schema";

export interface MemoryGraphNode {
  id: string;
  kind: "heap" | "stack-var" | "global";
  label: string;
  subtitle?: string;
  state?: "live" | "freed" | "dangling";
}
export interface MemoryGraphEdge {
  id: string;
  from: string;
  to: string;
  kind: "pointer" | "reference" | "ownership";
  label?: string;
  state?: "valid" | "dangling" | "unknown";
}
export interface MemoryGraph {
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
}
export interface PositionedNode extends MemoryGraphNode {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface LayoutResult {
  nodes: PositionedNode[];
  edges: MemoryGraphEdge[];
  width: number;
  height: number;
}

function compactValue(value: RuntimeValue): string {
  switch (value.kind) {
    case "scalar":
      return String(value.value);
    case "pointer":
      return value.targetAddress ?? "nullptr";
    case "reference":
      return value.targetAddress ?? "?";
    case "array":
      return `[${value.elements.length}]`;
    case "object":
      return value.typeName;
    case "uninitialized":
      return "?";
    case "unavailable":
      return "unavailable";
  }
}

function variableNode(binding: VariableBinding, kind: "stack-var" | "global"): MemoryGraphNode {
  return {
    id: binding.id,
    kind,
    label: binding.name,
    subtitle: `${binding.declaredType} = ${compactValue(binding.value)}`,
  };
}

export function deriveMemoryGraph(step: ExecutionStep): MemoryGraph {
  const variableNodes = [
    ...step.globals.map((binding) => variableNode(binding, "global")),
    ...step.frames.flatMap((frame) =>
      [...frame.parameters, ...frame.locals].map((binding) => variableNode(binding, "stack-var")),
    ),
  ];
  const heapNodes: MemoryGraphNode[] = [
    ...step.heap.live.map((object) => ({
      id: object.objectId,
      kind: "heap" as const,
      label: object.typeName ?? `${object.sizeBytes ?? "?"} bytes`,
      subtitle: object.address,
      state: "live" as const,
    })),
    ...(step.heap.recentlyFreed ?? []).map((object) => ({
      id: object.objectId,
      kind: "heap" as const,
      label: object.typeName ?? "freed allocation",
      subtitle: object.address,
      state: "freed" as const,
    })),
  ];
  const ids = new Set([...variableNodes, ...heapNodes].map((node) => node.id));
  const edges = pointersAtStep(step)
    .map((pointer) => ({
      pointer,
      source: ids.has(pointer.id)
        ? pointer.id
        : heapNodes.find(
            (node) => pointer.id.startsWith(`${node.id}.`) || pointer.id.startsWith(`${node.id}[`),
          )?.id,
    }))
    .filter(
      ({ pointer, source }) => pointer.targetObjectId && source && ids.has(pointer.targetObjectId),
    )
    .map(({ pointer, source }) => ({
      id: `${pointer.id}->${pointer.targetObjectId}`,
      from: source as string,
      to: pointer.targetObjectId as string,
      kind: pointer.value.kind === "reference" ? ("reference" as const) : ("pointer" as const),
      label: pointer.name,
      state:
        pointer.state === "dangling"
          ? ("dangling" as const)
          : pointer.state === "valid"
            ? ("valid" as const)
            : ("unknown" as const),
    }));
  return { nodes: [...variableNodes, ...heapNodes], edges };
}

export function layoutMemoryGraph(
  graph: MemoryGraph,
  previous: LayoutResult | undefined,
  direction: "LR" | "TB" = "LR",
): LayoutResult {
  const layout = new dagre.graphlib.Graph()
    .setGraph({ rankdir: direction, ranksep: 70, nodesep: 32 })
    .setDefaultEdgeLabel(() => ({}));
  for (const node of graph.nodes) layout.setNode(node.id, { width: 172, height: 64 });
  for (const edge of graph.edges) layout.setEdge(edge.from, edge.to);
  dagre.layout(layout);
  const previousPositions = new Map(previous?.nodes.map((node) => [node.id, node]) ?? []);
  const nodes = graph.nodes.map((node) => {
    const computed = layout.node(node.id) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    const old = previousPositions.get(node.id);
    return {
      ...node,
      x: old ? old.x * 0.35 + computed.x * 0.65 : computed.x,
      y: old ? old.y * 0.35 + computed.y * 0.65 : computed.y,
      width: computed.width,
      height: computed.height,
    };
  });
  const graphSize = layout.graph() as { width?: number; height?: number };
  return { nodes, edges: graph.edges, width: graphSize.width ?? 0, height: graphSize.height ?? 0 };
}
