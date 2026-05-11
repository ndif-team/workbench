# syntax=docker/dockerfile:1.7
# Image for PR preview deployments of the Next.js app at workbench/_web.
# Build context must be the repo root (the Dockerfile path is workbench/_web/Dockerfile)
# so the build can reach the sibling nnsightful symlink target if/when needed.

FROM oven/bun:1.2 AS deps
WORKDIR /app/workbench/_web
COPY workbench/_web/package.json workbench/_web/bun.lock* ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# Build under Node 20 (matches the runner stage) so the better-sqlite3
# native module rebuild produces a binary the runtime can actually load.
# bun's image has no npm, and the binding installed by bun is linked to
# bun's runtime — both reasons to do the build in node:20.
FROM node:20-slim AS builder
WORKDIR /app/workbench/_web
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data
COPY --from=deps /app/workbench/_web/node_modules ./node_modules
COPY workbench/_web ./
# Preview builds use sqlite + auth disabled, same shape as the E2E job.
# next build's "Collect page data" step opens LOCAL_SQLITE_URL, so the
# parent dir must already exist at build time (not only at runtime).
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_LOCAL_DB=true \
    NEXT_PUBLIC_DISABLE_AUTH=true \
    LOCAL_SQLITE_URL=/data/preview.db
RUN npm rebuild better-sqlite3 \
 && npm run build

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
