import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gunzip, gzip } from "node:zlib";
import { promisify } from "node:util";
import type { Finding, ProgramTrace } from "@seeplusplus/trace-schema";

const zip = promisify(gzip);
const unzip = promisify(gunzip);
export interface CachedRun {
  trace: ProgramTrace;
  findings: Finding[];
  sha256: string;
}
export interface TraceCache {
  get(key: string): Promise<CachedRun | undefined>;
  put(key: string, value: Omit<CachedRun, "sha256">): Promise<CachedRun>;
}

export class FileTraceCache implements TraceCache {
  constructor(private readonly root: string) {}
  private path(key: string) {
    return join(this.root, key.slice(0, 2), `${key}.json.gz`);
  }
  async get(key: string): Promise<CachedRun | undefined> {
    try {
      const compressed = await readFile(this.path(key));
      const raw = await unzip(compressed);
      const parsed = JSON.parse(raw.toString("utf8")) as CachedRun;
      const expected = createHash("sha256")
        .update(JSON.stringify({ trace: parsed.trace, findings: parsed.findings }))
        .digest("hex");
      if (parsed.sha256 !== expected) throw new Error("Trace cache integrity check failed");
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  async put(key: string, value: Omit<CachedRun, "sha256">): Promise<CachedRun> {
    const sha256 = createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const complete = { ...value, sha256 };
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, await zip(JSON.stringify(complete)));
    await rename(temporary, path);
    return complete;
  }
}

export class MemoryTraceCache implements TraceCache {
  private readonly values = new Map<string, CachedRun>();
  async get(key: string) {
    return this.values.get(key);
  }
  async put(key: string, value: Omit<CachedRun, "sha256">) {
    const complete = {
      ...value,
      sha256: createHash("sha256").update(JSON.stringify(value)).digest("hex"),
    };
    this.values.set(key, complete);
    return complete;
  }
}
