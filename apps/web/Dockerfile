FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/trace-schema/package.json packages/trace-schema/package.json
COPY packages/memory-model/package.json packages/memory-model/package.json
COPY packages/graph-engine/package.json packages/graph-engine/package.json
COPY packages/test-fixtures/package.json packages/test-fixtures/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
COPY packages packages
ARG VITE_API_URL=/v1
ARG VITE_DEMO_MODE=false
ENV VITE_API_URL=$VITE_API_URL VITE_DEMO_MODE=$VITE_DEMO_MODE
RUN pnpm --filter @seeplusplus/web... build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 4000
