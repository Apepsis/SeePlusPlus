import { describe, expect, it } from "vitest";
import { examples } from "@seeplusplus/test-fixtures";
import { pointersAtStep, reachableHeapObjectIds } from "./index.js";

describe("memory indexes", () => {
  it("extracts pointer roots and object fields", () => {
    const step = examples.find((item) => item.slug === "linked-list")!.trace.steps.at(-1)!;
    expect(pointersAtStep(step)).toHaveLength(4);
    expect(reachableHeapObjectIds(step).size).toBe(3);
  });
});
