# syntax=docker/dockerfile:1

# ── base ──────────────────────────────────────────────────────────────────
# One pinned Node for every stage, so the build and the runtime can never
# drift apart on a minor version.
FROM node:22-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# ── deps ──────────────────────────────────────────────────────────────────
# Isolated on purpose: only package.json and the lockfile land here, so
# editing application source does not invalidate the dependency-install
# layer. That is the difference between a 3-second rebuild and a 90-second
# one, on every single source change.
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── builder ───────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ── runner ────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# A container running as root is a finding in any real security review, and
# this one has no reason to: it serves HTTP and writes nothing.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# `output: standalone` has Next trace exactly the dependencies the server
# needs, so node_modules never ships whole — roughly 1.2GB down to under
# 200MB. Static assets and public/ are not traced and are copied explicitly.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# Compose cannot order service startup without this — the detector
# simulator's `depends_on: service_healthy` waits on exactly this probe.
#
# 127.0.0.1, never `localhost`: the image's /etc/hosts maps localhost to both
# 127.0.0.1 and ::1, busybox wget tries ::1 first, and Next's standalone
# server binds IPv4 only. Against `localhost` this probe fails with
# "connection refused" while the app is serving perfectly — which would leave
# the container permanently unhealthy and deadlock anything waiting on it.
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
