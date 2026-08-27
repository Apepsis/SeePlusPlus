# ProgramTrace protocol 1.0

The executable contract is `packages/trace-schema/src/index.ts`. It exports Zod
validators, inferred TypeScript types and JSON Schema.

## Invariants

- `schemaVersion` is exactly `1.0`.
- Step indexes are contiguous from zero.
- A compile failure contains zero execution steps.
- `frameId` remains stable for one concrete invocation.
- Heap identity includes an allocation generation; a recycled address never
  merges two lifetimes.
- Pointer/reference edges are derived from runtime values.
- `unavailable`, `uninitialized`, `nullptr`, `unknown` and `dangling` are distinct.
- Terminal outcomes distinguish user failures from platform failures.

## Raw-to-normalized boundary

The GDB runner returns raw records with frames, allocation events and bounded
I/O. `trace-normalizer` owns address normalization, generations, pointer target
resolution, heap snapshots, call/return inference and deltas. Only a trace that
passes `ProgramTraceSchema.parse` may leave the API.

## Reproducibility

Each trace records compiler name/version/flags, tracer identity, runner image
identity, limits and a cache key. Production images must replace
`local-unpinned` with their registry digest.
