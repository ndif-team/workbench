# syntax=docker/dockerfile:1.7
# Image for PR preview deployments of the Next.js app at workbench/_web.
# Build context must be the repo root (the Dockerfile path is workbench/_web/Dockerfile)
# so the build can reach the sibling nnsightful symlink target if/when needed.

FROM oven/bun:1.1 AS deps
WORKDIR /app/workbench/_web
COPY workbench/_web/package.json workbench/_web/bun.lock* ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

FROM oven/bun:1.1 AS builder
WORKDIR /app/workbench/_web
COPY --from=deps /app/workbench/_web/node_modules ./node_modules
COPY workbench/_web ./
# Preview builds use sqlite + auth disabled, same shape as the E2E job.
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_LOCAL_DB=true \
    NEXT_PUBLIC_DISABLE_AUTH=true \
    LOCAL_SQLITE_URL=/data/preview.db
RUN npm rebuild better-sqlite3 \
 && bun run build

FROM node:20-slim AS runner
WORKDIR /app/workbench/_web
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -m -u 1001 next \
 && mkdir -p /data && chown next:next /data
COPY --from=builder --chown=next:next /app/workbench/_web ./
USER next
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000", "-H", "0.0.0.0"]
