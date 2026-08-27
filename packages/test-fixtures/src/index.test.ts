import { describe, expect, it } from "vitest";
import { ProgramTraceSchema } from "@seeplusplus/trace-schema";
import { examples, supportMatrix } from "./index.js";

describe("golden fixtures", () => {
  it("all validate against trace schema v1", () => {
    for (const example of examples)
      expect(ProgramTraceSchema.safeParse(example.trace).success).toBe(true);
  });
  it("never claims threads are supported", () => {
    expect(supportMatrix.find((item) => item.id === "threads")?.status).toBe("unsupported");
  });
});
