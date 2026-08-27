import { spawn } from "node:child_process";
import type { RawRunResult } from "@seeplusplus/trace-normalizer";

export interface RunLimits {
  maxSteps: number;
  timeoutMs: number;
  memoryMb: number;
  maxOutputBytes: number;
  maxSourceBytes: number;
}
export interface RunnerInput {
  runId: string;
  source: string;
  languageMode: "cpp17" | "cpp20";
  stdin?: string;
  limits: RunLimits;
}
export interface RunnerAdapter {
  identity(): Promise<{ name: string; version: string; image: string }>;
  execute(input: RunnerInput): Promise<RawRunResult>;
}

async function spawnJson(
  command: string,
  args: string[],
  input: unknown,
  timeoutMs: number,
): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Runner orchestration exceeded ${timeoutMs} ms`));
    }, timeoutMs + 5000);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(stdout).toString("utf8");
      if (code !== 0 && !output)
        return reject(
          new Error(
            `Runner exited ${code}: ${Buffer.concat(stderr).toString("utf8").slice(0, 2000)}`,
          ),
        );
      try {
        resolve(JSON.parse(output));
      } catch {
        reject(new Error(`Runner returned invalid JSON: ${output.slice(0, 1000)}`));
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

export class DockerRunner implements RunnerAdapter {
  constructor(private readonly image: string) {}
  async identity() {
    return { name: "docker-gdb", version: "1.0.0", image: this.image };
  }
  async execute(input: RunnerInput): Promise<RawRunResult> {
    if (Buffer.byteLength(input.source, "utf8") > input.limits.maxSourceBytes)
      throw new Error("source_size_limit");
    const memory = `${input.limits.memoryMb}m`;
    const output = await spawnJson(
      "docker",
      [
        "run",
        "--rm",
        "--network",
        "none",
        "--read-only",
        "--tmpfs",
        "/work:rw,exec,nosuid,nodev,size=128m",
        "--memory",
        memory,
        "--memory-swap",
        memory,
        "--cpus",
        "1",
        "--pids-limit",
        "64",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--user",
        "10001:10001",
        "-e",
        `RUNNER_MAX_STEPS=${input.limits.maxSteps}`,
        "-e",
        `RUNNER_MAX_OUTPUT_BYTES=${input.limits.maxOutputBytes}`,
        "-e",
        `RUNNER_MAX_SOURCE_BYTES=${input.limits.maxSourceBytes}`,
        "-i",
        this.image,
      ],
      input,
      input.limits.timeoutMs,
    );
    const result = output as RawRunResult & { policyError?: string; protocolError?: string };
    if (result.policyError) throw new Error(result.policyError);
    if (result.protocolError) throw new Error(result.protocolError);
    return result;
  }
}

export class FixtureRunner implements RunnerAdapter {
  constructor(private readonly result: RawRunResult) {}
  async identity() {
    return { name: "fixture", version: "1", image: "none" };
  }
  async execute(_input: RunnerInput): Promise<RawRunResult> {
    return structuredClone(this.result);
  }
}

export class RunnerPool implements RunnerAdapter {
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  constructor(
    private readonly delegate: RunnerAdapter,
    private readonly concurrency: number,
  ) {}
  identity() {
    return this.delegate.identity();
  }
  private async acquire() {
    if (this.active < this.concurrency) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
  }
  private release() {
    this.active -= 1;
    this.waiters.shift()?.();
  }
  async execute(input: RunnerInput) {
    await this.acquire();
    try {
      return await this.delegate.execute(input);
    } finally {
      this.release();
    }
  }
}
