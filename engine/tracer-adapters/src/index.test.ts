import { describe, expect, it } from "vitest";
import { FixtureRunner, RunnerPool } from "./index.js";

const result = {
  compile: {
    exitCode: 1,
    stdout: "",
    stderr: "error",
    diagnostics: [],
    compilerName: "g++" as const,
    compilerVersion: "13",
    flags: [],
  },
  terminalKind: "compile_failure" as const,
  tracer: { name: "fixture", version: "1", imageDigest: "none" },
};
describe("runner adapters", () => {
  it("keeps the protocol result typed through the pool", async () => {
    const pool = new RunnerPool(new FixtureRunner(result), 1);
    await expect(
      pool.execute({
        runId: "x",
        source: "bad",
        languageMode: "cpp20",
        limits: {
          maxSteps: 1,
          timeoutMs: 100,
          memoryMb: 64,
          maxOutputBytes: 1024,
          maxSourceBytes: 1024,
        },
      }),
    ).resolves.toMatchObject({ terminalKind: "compile_failure" });
  });
});
