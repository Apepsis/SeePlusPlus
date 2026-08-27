# Runner threat model

The source string is hostile. Expected attacks include infinite loops, process
explosion, memory and output exhaustion, filesystem probing, network access,
cloud metadata access, compiler abuse and malformed tracer output.

## Controls

| Threat                 | Control                                                        |
| ---------------------- | -------------------------------------------------------------- |
| Host/API secret read   | No host mounts except bounded tmpfs; no secrets passed         |
| Network or metadata    | Dedicated `--network none` namespace                           |
| Infinite execution     | API deadline plus in-runner subprocess timeout                 |
| Memory exhaustion      | cgroup memory and swap maximum                                 |
| Process explosion      | cgroup PID limit; whole container removed                      |
| Privilege escalation   | UID 10001, all capabilities dropped, no-new-privileges         |
| Filesystem persistence | Read-only root; fresh tmpfs per run                            |
| Output flood           | bounded files and response truncation                          |
| Trace explosion        | server-controlled maximum steps and source size                |
| Protocol corruption    | program I/O redirected away from runner stdout; Zod validation |

The custom seccomp blueprint is intentionally not enabled by default because
GDB requires `ptrace` and toolchain syscall compatibility must be validated for
the exact image. Enabling a partially tested profile can create a false sense of
security. Production should generate a measured allowlist for the pinned image.

## Local Docker socket warning

Compose mounts the host Docker socket into the API container only to provide a
one-command development environment. Possession of that socket is equivalent to
host control. It is outside the untrusted runner but remains inappropriate for a
public service. Production must use a remote job/Lambda API with narrowly scoped
credentials and must never expose a Docker socket to a public-facing API.
