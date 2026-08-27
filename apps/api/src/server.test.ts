import { describe, expect, it } from "vitest";
import { loadApiConfig } from "@seeplusplus/config";
import { FixtureRunner } from "@seeplusplus/tracer-adapters";
import { MemoryTraceCache } from "./cache.js";
import { buildServer } from "./server.js";
import { MemoryWorkspaceRepository } from "./workspaces.js";

const config = loadApiConfig({ NODE_ENV: "test", EXEC_MODE: "fixture", LOG_LEVEL: "silent" });
const raw = {
  compile: {
    exitCode: 0,
    stdout: "",
    stderr: "",
    diagnostics: [],
    compilerName: "g++" as const,
    compilerVersion: "13",
    flags: ["-O0"],
  },
  records: [
    {
      line: 1,
      function: "main",
      frames: [
        {
          frameId: "main:1",
          function: { name: "main" },
          location: { file: "source.cpp", line: 1 },
          parameters: [],
          locals: [],
        },
      ],
      stdout: "",
      stderr: "",
    },
  ],
  runtime: { exitCode: 0, stdout: "", stderr: "" },
  terminalKind: "success" as const,
  tracer: { name: "fixture", version: "1", imageDigest: "fixture" },
};

describe("API", () => {
  it("reports health and produces a schema-valid run", async () => {
    const server = buildServer({
      config,
      runner: new FixtureRunner(raw),
      cache: new MemoryTraceCache(),
      workspaces: new MemoryWorkspaceRepository(),
    });
    expect((await server.inject({ method: "GET", url: "/v1/health" })).statusCode).toBe(200);
    const response = await server.inject({
      method: "POST",
      url: "/v1/runs",
      payload: { source: "int main(){return 0;}", languageMode: "cpp20" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "complete",
      cacheHit: false,
      trace: { schemaVersion: "1.0", terminal: { kind: "success" } },
    });
    await server.close();
  });

  it("creates and forks an anonymous workspace", async () => {
    const server = buildServer({
      config,
      runner: new FixtureRunner(raw),
      cache: new MemoryTraceCache(),
      workspaces: new MemoryWorkspaceRepository(),
    });
    const created = (
      await server.inject({
        method: "POST",
        url: "/v1/workspaces",
        payload: { title: "Pointer lab", code: "int main(){}" },
      })
    ).json();
    const fork = await server.inject({ method: "POST", url: `/v1/workspaces/${created.id}/fork` });
    expect(fork.statusCode).toBe(200);
    expect(fork.json().title).toContain("fork");
    await server.close();
  });
});
