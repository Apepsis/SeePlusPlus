import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { z } from "zod";
import { analyze } from "@seeplusplus/analyzer";
import type { ApiConfig } from "@seeplusplus/config";
import { examples, supportMatrix } from "@seeplusplus/test-fixtures";
import { computeCacheKey, normalizeRun } from "@seeplusplus/trace-normalizer";
import { RunResponseSchema, type Finding, type ProgramTrace } from "@seeplusplus/trace-schema";
import type { RunnerAdapter } from "@seeplusplus/tracer-adapters";
import type { TraceCache } from "./cache.js";
import type { WorkspaceRepository } from "./workspaces.js";

const RunRequest = z.object({
  source: z.string().min(1),
  languageMode: z.enum(["cpp17", "cpp20"]).default("cpp20"),
  stdin: z.string().max(65_536).default(""),
});
const WorkspaceRequest = z.object({
  title: z.string().min(1).max(120),
  code: z.string().min(1),
  languageMode: z.enum(["cpp17", "cpp20"]).default("cpp20"),
  visibility: z.enum(["private", "unlisted", "public"]).default("unlisted"),
});

export interface ServerDependencies {
  config: ApiConfig;
  runner: RunnerAdapter;
  cache: TraceCache;
  workspaces: WorkspaceRepository;
}

export function buildServer(dependencies: ServerDependencies) {
  const { config, runner, cache, workspaces } = dependencies;
  const server = Fastify({
    logger: { level: config.LOG_LEVEL },
    bodyLimit: config.RUNNER_MAX_SOURCE_BYTES + 70_000,
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
  });
  const runs = new Map<string, { trace: ProgramTrace; findings: Finding[] }>();
  server.register(cors, {
    origin: config.WEB_ORIGIN.split(",").map((value) => value.trim()),
    credentials: false,
  });
  server.register(rateLimit, { max: 30, timeWindow: "1 minute" });

  server.get("/v1/health", async () => ({
    status: "ok",
    service: "seeplusplus-api",
    schemaVersion: "1.0",
  }));
  server.get("/v1/ready", async (_request, reply) => {
    try {
      const identity = await runner.identity();
      return { status: "ready", runner: identity };
    } catch (error) {
      return reply.code(503).send({ status: "not-ready", reason: (error as Error).message });
    }
  });
  server.get("/v1/examples", async () => examples.map(({ trace: _trace, ...example }) => example));
  server.get("/v1/support", async () => supportMatrix);
  server.get("/v1/openapi.json", async () => ({
    openapi: "3.1.0",
    info: { title: "SeePlusPlus API", version: "1.0.0" },
    paths: {
      "/v1/runs": { post: { summary: "Compile and trace C++" } },
      "/v1/runs/{runId}": { get: { summary: "Fetch a completed run" } },
      "/v1/workspaces": { post: { summary: "Create a shareable workspace" } },
    },
  }));

  server.post(
    "/v1/runs",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = RunRequest.safeParse(request.body);
      if (!parsed.success)
        return reply.code(422).send({ error: "invalid_request", issues: parsed.error.issues });
      if (Buffer.byteLength(parsed.data.source, "utf8") > config.RUNNER_MAX_SOURCE_BYTES)
        return reply.code(413).send({ error: "source_size_limit" });
      const identity = await runner.identity();
      const cacheKey = computeCacheKey(
        parsed.data.source,
        parsed.data.stdin,
        `${identity.name}:${identity.version}:${identity.image}`,
      );
      const cached = await cache.get(cacheKey);
      if (cached) {
        runs.set(cached.trace.run.runId, { trace: cached.trace, findings: cached.findings });
        return RunResponseSchema.parse({
          runId: cached.trace.run.runId,
          status: "complete",
          cacheHit: true,
          trace: cached.trace,
          findings: cached.findings,
        });
      }
      const runId = randomUUID();
      try {
        const raw = await runner.execute({
          runId,
          ...parsed.data,
          limits: {
            maxSteps: config.RUNNER_MAX_STEPS,
            timeoutMs: config.RUNNER_TIMEOUT_MS,
            memoryMb: config.RUNNER_MEMORY_MB,
            maxOutputBytes: config.RUNNER_MAX_OUTPUT_BYTES,
            maxSourceBytes: config.RUNNER_MAX_SOURCE_BYTES,
          },
        });
        const trace = normalizeRun(raw, {
          runId,
          source: parsed.data.source,
          languageMode: parsed.data.languageMode,
          cacheKey,
          limits: {
            maxSteps: config.RUNNER_MAX_STEPS,
            timeoutMs: config.RUNNER_TIMEOUT_MS,
            memoryMb: config.RUNNER_MEMORY_MB,
            maxOutputBytes: config.RUNNER_MAX_OUTPUT_BYTES,
          },
        });
        const findings = analyze(trace);
        runs.set(runId, { trace, findings });
        if (trace.terminal.kind === "success") await cache.put(cacheKey, { trace, findings });
        request.log.info({
          event: "run.complete",
          runId,
          terminal: trace.terminal.kind,
          steps: trace.steps.length,
          cacheHit: false,
        });
        return RunResponseSchema.parse({
          runId,
          status: "complete",
          cacheHit: false,
          trace,
          findings,
        });
      } catch (error) {
        request.log.error({ event: "run.internal_error", runId, error: (error as Error).message });
        return reply
          .code(502)
          .send({ error: "runner_error", runId, message: (error as Error).message });
      }
    },
  );
  server.get<{ Params: { runId: string } }>("/v1/runs/:runId", async (request, reply) => {
    const value = runs.get(request.params.runId);
    return value
      ? { runId: request.params.runId, status: "complete", ...value }
      : reply.code(404).send({ error: "run_not_found" });
  });
  server.get<{ Params: { runId: string } }>(
    "/v1/runs/:runId/trace",
    async (request, reply) =>
      runs.get(request.params.runId)?.trace ?? reply.code(404).send({ error: "run_not_found" }),
  );

  server.post("/v1/workspaces", async (request, reply) => {
    const parsed = WorkspaceRequest.safeParse(request.body);
    return parsed.success
      ? reply.code(201).send(await workspaces.create(parsed.data))
      : reply.code(422).send({ error: "invalid_request", issues: parsed.error.issues });
  });
  server.get<{ Params: { slug: string } }>(
    "/v1/workspaces/:slug",
    async (request, reply) =>
      (await workspaces.getBySlug(request.params.slug)) ??
      reply.code(404).send({ error: "workspace_not_found" }),
  );
  server.patch<{ Params: { id: string } }>("/v1/workspaces/:id", async (request, reply) => {
    const body = z
      .object({ version: z.number().int().positive(), ...WorkspaceRequest.partial().shape })
      .safeParse(request.body);
    if (!body.success) return reply.code(422).send({ error: "invalid_request" });
    const { version, ...patch } = body.data;
    return (
      (await workspaces.update(request.params.id, version, patch)) ??
      reply.code(409).send({ error: "version_conflict_or_missing" })
    );
  });
  server.post<{ Params: { id: string } }>(
    "/v1/workspaces/:id/fork",
    async (request, reply) =>
      (await workspaces.fork(request.params.id)) ??
      reply.code(404).send({ error: "workspace_not_found" }),
  );

  return server;
}
