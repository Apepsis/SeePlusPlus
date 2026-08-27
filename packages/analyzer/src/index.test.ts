import { describe, expect, it } from "vitest";
import { examples } from "@seeplusplus/test-fixtures";
import { analyzeDanglingPointers, analyzeLeaks } from "./index.js";

describe("analyzers", () => {
  it("reports surviving aliases after delete", () => {
    const trace = examples.find((item) => item.slug === "heap-lifetime")!.trace;
    expect(analyzeDanglingPointers(trace)).toHaveLength(2);
  });
  it("does not report freed allocations as leaks", () => {
    const trace = examples.find((item) => item.slug === "heap-lifetime")!.trace;
    expect(analyzeLeaks(trace)).toEqual([]);
  });
});
