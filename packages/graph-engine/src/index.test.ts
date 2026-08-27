import { describe, expect, it } from "vitest";
import { examples } from "@seeplusplus/test-fixtures";
import { deriveMemoryGraph, layoutMemoryGraph } from "./index.js";

describe("memory graph", () => {
  it("derives linked structures without a list-specific parser", () => {
    const step = examples.find((item) => item.slug === "linked-list")!.trace.steps.at(-1)!;
    const graph = deriveMemoryGraph(step);
    expect(graph.nodes.filter((node) => node.kind === "heap")).toHaveLength(3);
    expect(graph.edges).toHaveLength(3);
    expect(layoutMemoryGraph(graph, undefined).width).toBeGreaterThan(0);
  });
});
