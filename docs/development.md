# Development

## Native web/API workflow

Run Postgres separately or omit `DATABASE_URL` for the in-memory workspace
repository. The API still requires Docker to execute C++.

```bash
corepack enable
pnpm install
docker build -f runner/local/Dockerfile -t seeplusplus-runner:local .
pnpm dev
```

The Vite server is `http://localhost:4000`; API is `http://localhost:3000`.

## Acceptance commands

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:runner
pnpm test:security
```

When the compiler, GDB or allocation tracker changes, rerun the runner and
security suites and review golden semantic assertions. Raw addresses must never
be snapshot-tested; assert identities, relationships, values and lifetimes.
