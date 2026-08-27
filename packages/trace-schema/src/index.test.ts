import { describe, expect, it } from "vitest";
import { ProgramTraceSchema, TRACE_SCHEMA_VERSION } from "./index.js";

const valid = {
  schemaVersion: TRACE_SCHEMA_VERSION,
  run: {
    runId: "test-run",
    createdAt: "2026-08-27T00:00:00.000Z",
    compiler: { name: "g++", version: "13", flags: ["-O0"] },
    tracer: { name: "gdb-python", version: "1", imageDigest: "local" },
    limits: { maxSteps: 10, timeoutMs: 1000, memoryMb: 128, maxOutputBytes: 1024 },
    cacheKey: "abc",
  },
  source: { filename: "source.cpp", languageMode: "cpp20", text: "", sha256: "abc" },
  build: { success: true, exitCode: 0, stdout: "", stderr: "", diagnostics: [] },
  steps: [
    {
      index: 0,
      event: "line",
      location: null,
      frames: [],
      globals: [],
      heap: { live: [] },
      io: { stdout: "", stderr: "" },
    },
  ],
  terminal: { kind: "success", exitCode: 0 },
} as const;

describe("ProgramTraceSchema", () => {
  it("accepts a valid trace", () => {
    expect(ProgramTraceSchema.parse(valid).steps).toHaveLength(1);
  });

  it("rejects non-contiguous indexes", () => {
    expect(() =>
      ProgramTraceSchema.parse({ ...valid, steps: [{ ...valid.steps[0], index: 4 }] }),
    ).toThrow(/contiguous/);
  });
});
