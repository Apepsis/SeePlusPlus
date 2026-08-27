import { loadApiConfig } from "@seeplusplus/config";
import { DockerRunner, RunnerPool } from "@seeplusplus/tracer-adapters";
import { FileTraceCache } from "./cache.js";
import { buildServer } from "./server.js";
import { MemoryWorkspaceRepository, PgWorkspaceRepository } from "./workspaces.js";

const config = loadApiConfig();
const runner = new RunnerPool(new DockerRunner(config.RUNNER_IMAGE), config.RUNNER_CONCURRENCY);
const workspaces = config.DATABASE_URL
  ? new PgWorkspaceRepository(config.DATABASE_URL)
  : new MemoryWorkspaceRepository();
const server = buildServer({
  config,
  runner,
  cache: new FileTraceCache(config.TRACE_CACHE_DIR),
  workspaces,
});

try {
  await server.listen({ port: config.API_PORT, host: "0.0.0.0" });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
