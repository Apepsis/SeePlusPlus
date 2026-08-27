import { z } from "zod";

export const ApiConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ORIGIN: z.string().default("http://localhost:4000"),
  EXEC_MODE: z.enum(["docker", "fixture"]).default("docker"),
  RUNNER_IMAGE: z.string().default("seeplusplus-runner:local"),
  RUNNER_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(10_000),
  RUNNER_MEMORY_MB: z.coerce.number().int().min(64).max(2048).default(512),
  RUNNER_MAX_STEPS: z.coerce.number().int().min(1).max(5000).default(1000),
  RUNNER_MAX_OUTPUT_BYTES: z.coerce.number().int().min(1024).max(1_048_576).default(65_536),
  RUNNER_MAX_SOURCE_BYTES: z.coerce.number().int().min(1024).max(1_048_576).default(65_536),
  RUNNER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  DATABASE_URL: z.string().optional(),
  TRACE_CACHE_DIR: z.string().default("./data/traces"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type ApiConfig = z.infer<typeof ApiConfigSchema>;
export function loadApiConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  return ApiConfigSchema.parse(environment);
}
