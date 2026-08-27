import { spawnSync } from "node:child_process";

function execute(name, source, limits = {}) {
  const request = {
    runId: `security-${name}`,
    source,
    languageMode: "cpp20",
    stdin: "",
    limits: { maxSteps: 200, timeoutMs: 1500, memoryMb: 128, maxOutputBytes: 8192, ...limits },
  };
  const args = [
    "run",
    "--rm",
    "--network",
    "none",
    "--read-only",
    "--tmpfs",
    "/work:rw,exec,nosuid,nodev,size=32m",
    "--memory",
    "128m",
    "--memory-swap",
    "128m",
    "--cpus",
    ".5",
    "--pids-limit",
    "32",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "-i",
    "seeplusplus-runner:local",
  ];
  const result = spawnSync("docker", args, {
    input: JSON.stringify(request),
    encoding: "utf8",
    timeout: 8000,
  });
  if (!result.stdout) throw new Error(`${name}: no protocol response (${result.stderr})`);
  return JSON.parse(result.stdout);
}

const timeout = execute("timeout", "int main(){ while(true){} }");
if (timeout.terminalKind !== "timeout" && timeout.terminalKind !== "output_limit")
  throw new Error(`infinite loop escaped policy: ${timeout.terminalKind}`);

const network = execute(
  "network",
  `#include <sys/socket.h>
#include <arpa/inet.h>
#include <iostream>
int main(){ int s=socket(AF_INET,SOCK_STREAM,0); sockaddr_in a{}; a.sin_family=AF_INET; a.sin_port=htons(80); inet_pton(AF_INET,"1.1.1.1",&a.sin_addr); std::cout << connect(s,(sockaddr*)&a,sizeof(a)); }`,
);
if (!network.records?.at(-1)?.stdout?.includes("-1"))
  throw new Error("network namespace test did not observe a denied/unreachable connection");

const filesystem = execute(
  "filesystem",
  `#include <fstream>
#include <iostream>
int main(){ std::ifstream f("/etc/shadow"); std::cout << f.good(); }`,
);
if (!filesystem.records?.at(-1)?.stdout?.includes("0"))
  throw new Error("runner user could read /etc/shadow");

console.log(
  JSON.stringify({
    status: "ok",
    timeout: timeout.terminalKind,
    network: "blocked",
    hostSecrets: "unreadable",
  }),
);
