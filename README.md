# SeePlusPlus

**SeePlusPlus** is an interactive C++ execution visualizer for studying what happens inside a program while it runs.

It compiles real C++ code with debug information, traces execution through GDB/DWARF, normalizes runtime state into a stable trace format, and renders stack frames, heap objects, pointers, lifetimes, console output, and analyzer findings in an interactive web interface.

The project is designed as an engineering and educational systems prototype rather than a simulated code-animation demo: runtime state comes from the executed program whenever the active runner is used, and unsupported values are reported as unavailable instead of being guessed.

## What it visualizes

- source-code execution step by step;
- function calls, returns, and recursion;
- stack frames and local variables;
- heap allocations created with `new` and released with `delete`;
- pointer relationships and aliasing;
- linked structures such as lists and trees;
- allocation generations and object lifetimes;
- console input/output;
- memory-related findings such as leaks, dangling references, and reachability problems;
- ASan/UBSan terminal failures when available from the runner.

## How it works

```text
C++ source
    |
    v
API -> isolated runner container
          |
          +-> compile with GCC + DWARF
          +-> execute under GDB
          +-> record frames, variables and allocation events
          |
          v
      raw runtime records
          |
          v
normalizer -> ProgramTrace v1 -> analyzer
          |                    |
          +---------+----------+
                    v
              web visualizer
     code | stack | heap | graph | console
```

The browser owns editing, playback, and rendering. The API owns run IDs, quotas, caching, normalization, validation, and persistence. The runner owns compilation and debugger instrumentation and is intentionally separated from database or cloud credentials.

See [`docs/architecture.md`](docs/architecture.md) for the full boundary model and execution sequence.

## Current implementation status

The current baseline includes:

- real C++ compilation and tracing through GDB/DWARF;
- a versioned `ProgramTrace` schema;
- stack, heap, console, and playback views;
- a semantic pointer/object graph;
- memory analysis for leaks, reachability, dangling objects, and sanitizer failures;
- tracked `new`/`delete` lifetime visualization;
- content-addressed trace caching;
- workspace persistence through in-memory or PostgreSQL adapters;
- CI checks for type safety, tests, runner behavior, and hostile-code containment;
- GitHub Pages build support for static demonstration traces.

For the exact implementation matrix and known limitations, see [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md).

## Supported C++ subset

Supported today includes, with explicit limits:

- primitive local variables;
- function calls and returns;
- recursion;
- raw pointers and aliasing;
- fixed arrays;
- struct/class fields;
- `new` / `delete`;
- linked data structures.

References, constructors/destructors, exceptions, standard-library containers, smart pointers, inheritance, templates, and `new[]` / `delete[]` remain experimental. Threads and custom compiler/toolchain configuration are not supported by the current trace model.

See [`docs/supported-cpp.md`](docs/supported-cpp.md) for the evidence-backed support registry.

## Repository structure

```text
apps/
  api/                  API, run orchestration, persistence and cache integration
  web/                  React/Vite execution visualizer

engine/                 trace schema, normalizer, analyzer, graph and memory logic
runner/                 isolated C++ compiler/debugger runtime
db/                     persistence and migrations
examples/               semantic and visualization examples
infra/                   security policy and deployment blueprints
docs/                    architecture, validation and implementation notes
```

## Run locally

### Requirements

- Node.js 22+
- pnpm / Corepack
- Docker Desktop or Docker Engine
- Git

### Install

```bash
corepack enable
pnpm install
```

Build the isolated C++ runner:

```bash
docker build -f runner/local/Dockerfile -t seeplusplus-runner:local .
```

Start the development environment:

```bash
pnpm dev
```

Default local endpoints:

- Web: `http://localhost:4000`
- API: `http://localhost:3000`

PostgreSQL is optional for development; without `DATABASE_URL`, the API can use the in-memory workspace repository.

Detailed development notes are in [`docs/development.md`](docs/development.md).

## Validation

Run the main acceptance checks with:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:runner
pnpm test:security
```

The runner tests assert semantic behavior instead of raw memory addresses, because addresses vary between executions.

## Security model

SeePlusPlus executes untrusted C++ code only inside a constrained runner environment. The project includes explicit resource limits and a seccomp policy, and the runner is kept separate from application/database credentials.

This is still a research/engineering prototype, not a general-purpose secure online judge. The current hardening baseline is documented in [`docs/threat-model.md`](docs/threat-model.md) and [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md).

## Design principles

- show runtime truth instead of inventing values;
- keep the trace schema independent from the UI layout;
- separate execution from persistence and presentation;
- make unsupported behavior explicit;
- validate features with semantic fixtures and runner conformance tests;
- preserve enough structure to replace the local runner with ECS, Lambda, microVMs, or another tracer without redesigning the frontend trace model.

## License

MIT. See [`LICENSE`](LICENSE).
