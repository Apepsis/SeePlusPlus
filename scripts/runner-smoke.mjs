import { spawnSync } from "node:child_process";

const source = `struct Node { int value; Node* next; };
int twice(int value) { return value * 2; }
int main() {
  Node* head = new Node{twice(3), nullptr};
  delete head;
  return 0;
}`;
const request = {
  runId: "runner-smoke",
  source,
  languageMode: "cpp20",
  stdin: "",
  limits: { maxSteps: 200, timeoutMs: 10000, memoryMb: 512, maxOutputBytes: 65536 },
};
const result = spawnSync(
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
    "512m",
    "--cpus",
    "1",
    "--pids-limit",
    "64",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "-i",
    "seeplusplus-runner:local",
  ],
  { input: JSON.stringify(request), encoding: "utf8", timeout: 20000 },
);
if (result.status !== 0) throw new Error(result.stderr || `runner exited ${result.status}`);
const body = JSON.parse(result.stdout);
if (body.compile?.exitCode !== 0) throw new Error(body.compile?.stderr || "compile failed");
if (!Array.isArray(body.records) || body.records.length < 2)
  throw new Error("real tracer did not produce enough records");
if (
  !body.records.some((record) =>
    record.frames?.some((frame) => frame.function?.name?.includes("twice")),
  )
)
  throw new Error("nested function frame was not observed");
if (
  !body.records.some((record) => record.allocationEvents?.some((event) => event.kind === "alloc"))
)
  throw new Error("allocation event was not observed");
console.log(
  JSON.stringify({ status: "ok", steps: body.records.length, terminal: body.terminalKind }),
);
