# syntax=docker/dockerfile:1.7
# Image for PR preview deployments of the Next.js app at workbench/_web.
# Build context must be the repo root (the Dockerfile path is workbench/_web/Dockerfile)
# so the build can reach the sibling nnsightful symlink target if/when needed.

# Build the transformer-explainer Svelte SPA in a separate stage so its
# build output can be copied into the Next.js public/ tree. Served at
# /transformer-explainer/ on the same host as the Next.js app (no CORS
# in production; the API call goes to api.<host> per ALLOWED_ORIGIN_REGEX).
FROM node:20-slim AS te-builder
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ARG TE_REPO=https://github.com/ndif-team/transformer-explainer.git
ARG TE_REF=forward-pass
# Docker caches RUN layers by their literal command + previous layer
# hash, so `git clone` is reused across builds even after the branch HEAD
# moves. ADD a per-ref JSON from the GitHub API so the layer cache busts
# whenever TE's HEAD changes; the resulting file is referenced only for
# its checksum effect on the cache key, not its contents.
ADD https://api.github.com/repos/ndif-team/transformer-explainer/commits/${TE_REF} /tmp/te-ref.json
RUN git clone --depth 1 --branch ${TE_REF} ${TE_REPO} te
WORKDIR /app/te
ARG VITE_WORKBENCH_API=http://localhost:8000
ARG VITE_USER_EMAIL=dev@localhost
ARG BASE_PATH=/transformer-explainer
ENV VITE_WORKBENCH_API=${VITE_WORKBENCH_API} \
    VITE_USER_EMAIL=${VITE_USER_EMAIL} \
    BASE_PATH=${BASE_PATH}
# `npm install` first without NODE_ENV=production so devDependencies
# (vite, sveltekit, svelte-check, etc.) actually get installed. Only
# after the install is complete do we flip NODE_ENV=production. The
# BASE_PATH env var (read by svelte.config.js) is the source of truth
# for the deploy prefix — relying on NODE_ENV alone was racy with vite's
# own mode handling.
RUN npm install --legacy-peer-deps
ENV NODE_ENV=production
RUN npm run build

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
# Bring transformer-explainer's static build into public/ so Next.js
# serves it at /transformer-explainer/* (see next.config.js rewrites for
# the trailing-slash entrypoint).
COPY --from=te-builder /app/te/build ./public/transformer-explainer
# NEXT_PUBLIC_BACKEND_URL is inlined into the JS bundle by Next.js — must
# be set at build time. Defaults to the dev placeholder so a vanilla
# `docker build` still produces a working (but offline-backend) image.
ARG NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
# Preview builds use sqlite + auth disabled, same shape as the E2E job.
# next build's "Collect page data" step opens LOCAL_SQLITE_URL, so the
# parent dir must already exist at build time (not only at runtime).
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_LOCAL_DB=true \
    NEXT_PUBLIC_DISABLE_AUTH=true \
    NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL \
    LOCAL_SQLITE_URL=/data/preview.db
RUN npm rebuild better-sqlite3 \
 && npm run build

FROM node:20-slim AS runner
WORKDIR /app/workbench/_web
# NEXT_PUBLIC_* are inlined at build time; the runtime ones must match
# so drizzle-kit reads the same DB path that the app will query.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_PUBLIC_LOCAL_DB=true \
    NEXT_PUBLIC_DISABLE_AUTH=true \
    LOCAL_SQLITE_URL=/data/preview.db
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -m -u 1001 next \
 && mkdir -p /data && chown next:next /data
COPY --from=builder --chown=next:next /app/workbench/_web ./
USER next
EXPOSE 3000
# Each preview pod starts with an empty /data volume, so drizzle-kit
# pushes the SQLite schema on boot before next start. Idempotent — no-op
# on container restart since /data is per-pod and re-mounted empty. Log
# bracketing the push so a failing pod's logs say *why* it never
# reached `next start`.
CMD ["sh", "-c", "echo '[boot] drizzle-kit push…' && npx drizzle-kit push --force && echo '[boot] schema ready, starting next' && exec npx next start -p 3000 -H 0.0.0.0"]
