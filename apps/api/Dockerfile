FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json eslint.config.js ./
COPY apps/api/package.json apps/api/package.json
COPY packages/trace-schema/package.json packages/trace-schema/package.json
COPY packages/analyzer/package.json packages/analyzer/package.json
COPY packages/memory-model/package.json packages/memory-model/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/test-fixtures/package.json packages/test-fixtures/package.json
COPY packages/graph-engine/package.json packages/graph-engine/package.json
COPY engine/trace-normalizer/package.json engine/trace-normalizer/package.json
COPY engine/tracer-adapters/package.json engine/tracer-adapters/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
COPY packages packages
COPY engine engine
RUN pnpm --filter @seeplusplus/api... build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends docker.io ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production
USER node
CMD ["node", "apps/api/dist/index.js"]
