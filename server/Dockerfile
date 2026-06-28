# ─── AcademyFlow API ───────────────────────────────────────────────────────────
# Multi-stage build: install deps in a build layer, copy only what's needed
# into a slim runtime image.
#
# NOTE: uses "slim" (Debian + glibc/OpenSSL), not "alpine" (musl). Alpine's
# OpenSSL/TLS stack has a well-documented incompatibility negotiating TLS with
# MongoDB Atlas from inside containers (fails with "SSL routines:ssl3_read_bytes:
# tlsv1 alert internal error"). Slim avoids this entirely and is still small.

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Install all deps (server doesn't need vite/react/etc., but npm doesn't let us
# split frontend/backend deps without a workspace — full install is simplest).
RUN npm ci --omit=optional

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Run as a non-root user inside the container.
RUN groupadd -r academyflow && useradd -r -g academyflow academyflow

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server

# server/data.json fallback (used only when MONGODB_URI is unset) needs a
# writable location — mount a volume here in compose/production if you rely
# on the local-JSON fallback instead of MongoDB.
RUN mkdir -p /app/server && chown -R academyflow:academyflow /app

USER academyflow

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.API_PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.mjs"]

