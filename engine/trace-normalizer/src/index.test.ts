import { describe, expect, it } from "vitest";
import { normalizeRun, parseGccDiagnostics, type RawRunResult } from "./index.js";

const raw: RawRunResult = {
  compile: {
    exitCode: 0,
    stdout: "",
    stderr: "",
    diagnostics: [],
    compilerName: "g++",
    compilerVersion: "13.3",
    flags: ["-O0"],
  },
  records: [
    {
      line: 2,
      function: "main",
      frames: [
        {
          frameId: "main:1",
          function: { name: "main" },
          location: { file: "source.cpp", line: 2 },
          parameters: [],
          locals: [],
        },
      ],
      allocationEvents: [{ kind: "alloc", address: "0x1000", sizeBytes: 4 }],
    },
    {
      line: 3,
      function: "main",
      frames: [
        {
          frameId: "main:1",
          function: { name: "main" },
          location: { file: "source.cpp", line: 3 },
          parameters: [],
          locals: [
            {
              id: "main:p",
              name: "p",
              declaredType: "int *",
              storage: "local",
              initialized: true,
              value: {
                kind: "pointer",
                pointerType: "int *",
                targetAddress: "0x1000",
                state: "unknown",
              },
            },
          ],
        },
      ],
      heapValues: [
        {
          address: "0x1000",
          typeName: "int",
          value: { kind: "scalar", scalarType: "int", value: 3 },
        },
      ],
    },
    {
      line: 4,
      function: "main",
      frames: [
        {
          frameId: "main:1",
          function: { name: "main" },
          location: { file: "source.cpp", line: 4 },
          parameters: [],
          locals: [
            {
              id: "main:p",
              name: "p",
              declaredType: "int *",
              storage: "local",
              initialized: true,
              value: {
                kind: "pointer",
                pointerType: "int *",
                targetAddress: "0x1000",
                state: "unknown",
              },
            },
          ],
        },
      ],
      allocationEvents: [{ kind: "free", address: "0x1000" }],
    },
  ],
  runtime: { exitCode: 0, stdout: "", stderr: "" },
  terminalKind: "success",
  tracer: { name: "fixture", version: "1", imageDigest: "fixture" },
};

describe("normalizer", () => {
  it("creates stable allocation generations and dangling pointers", () => {
    const trace = normalizeRun(raw, {
      runId: "r",
      source: "int main(){}",
      languageMode: "cpp20",
      cacheKey: "c",
      createdAt: "2026-08-27T00:00:00.000Z",
      limits: { maxSteps: 10, timeoutMs: 1000, memoryMb: 128, maxOutputBytes: 1024 },
    });
    expect(trace.steps[1]!.heap.live[0]!.objectId).toBe("heap:0x1000:1");
    expect(trace.steps[2]!.frames[0]!.locals[0]!.value).toMatchObject({
      state: "dangling",
      targetObjectId: "heap:0x1000:1",
    });
  });
  it("maps GCC diagnostics to original lines", () => {
    expect(parseGccDiagnostics("source.cpp:7:4: error: expected ';' before '}'")[0]).toMatchObject({
      line: 7,
      column: 4,
      severity: "error",
    });
  });
});
