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
# TE_REF: pin to a specific commit SHA for reproducible builds. Updating
# this value also busts the docker layer cache below it (the ADD line
# embeds it in a URL, and the RUN line uses it as a clone target — both
# layer hashes change when TE_REF changes). Bump this when there's a new
# TE commit to ship into the preview.
ARG TE_REF=22b1402c608f417989bcbae4d9980312179562de
ADD https://api.github.com/repos/ndif-team/transformer-explainer/commits/${TE_REF} /tmp/te-ref.json
# `git clone --branch` works with tag or branch names but not bare SHAs,
# so for a SHA we shallow clone the default branch then fetch+checkout.
# Falls back to --branch for human-readable refs (branches/tags).
RUN if echo "${TE_REF}" | grep -Eq '^[0-9a-f]{40}$'; then \
        git clone --filter=blob:none ${TE_REPO} te \
     && git -C te fetch --depth 1 origin ${TE_REF} \
     && git -C te checkout ${TE_REF}; \
    else \
        git clone --depth 1 --branch ${TE_REF} ${TE_REPO} te; \
    fi
WORKDIR /app/te
# preview-deploy.yml already passes NEXT_PUBLIC_BACKEND_URL (Next.js
# needs it for the same workbench API host). We reuse it here so the
# te-builder doesn't need a separate workflow change to land first
# (pull_request_target uses the workflow from main, not from the PR
# HEAD — see https://docs.github.com/en/actions/security-guides/automatic-token-authentication).
ARG NEXT_PUBLIC_BACKEND_URL
ARG VITE_WORKBENCH_API
ARG VITE_USER_EMAIL=dev@localhost
ARG BASE_PATH=/transformer-explainer
# Resolve VITE_WORKBENCH_API: prefer the explicit arg, fall back to the
# Next.js backend URL. Fail the build if neither is set so a future
# misconfiguration produces a clear error instead of a silently broken
# bundle (the localhost:8000 fallback that triggered this hardening).
RUN export VITE_WORKBENCH_API="${VITE_WORKBENCH_API:-${NEXT_PUBLIC_BACKEND_URL}}" \
 && test -n "${VITE_WORKBENCH_API}" \
    || (echo "Either VITE_WORKBENCH_API or NEXT_PUBLIC_BACKEND_URL build-arg is required" && exit 1) \
 && printf 'VITE_WORKBENCH_API=%s\nVITE_USER_EMAIL=%s\nBASE_PATH=%s\n' \
    "${VITE_WORKBENCH_API}" "${VITE_USER_EMAIL}" "${BASE_PATH}" > .env.production \
 && cat .env.production
# `npm install` first without NODE_ENV=production so devDependencies
# (vite, sveltekit, svelte-check, etc.) actually get installed.
RUN npm install --legacy-peer-deps
# BASE_PATH is read by svelte.config.js for the deploy prefix; relying on
# NODE_ENV alone was racy with vite's own mode handling, so we set it
# explicitly here as well.
ENV NODE_ENV=production BASE_PATH=${BASE_PATH}
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
