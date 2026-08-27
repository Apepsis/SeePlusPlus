# Phase 0 validation — contracts and application

Date: 27 August 2026

| Command | Result |
|---|---|
| `pnpm format:check` | Passed after formatting |
| `pnpm lint` | Passed, zero warnings |
| `pnpm typecheck` | Passed across 10 workspace packages/apps |
| `pnpm test` | 13 tests passed, 0 failed |
| `VITE_DEMO_MODE=true VITE_API_URL='' pnpm build` | Passed |

Schema tests reject non-contiguous steps. Normalizer tests assert allocation
generation and dangling-state resolution. Analyzer tests cover positive dangling
and negative leak cases. API tests cover a schema-valid run plus workspace fork.
