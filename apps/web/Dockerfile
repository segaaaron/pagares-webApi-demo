# syntax=docker/dockerfile:1
# Dashboard — Next.js en modo standalone: la imagen final lleva sólo el servidor
# y sus dependencias reales, no el workspace entero.

FROM node:22-alpine AS base
RUN corepack enable && apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/api-core/package.json packages/api-core/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain-rules/package.json packages/domain-rules/
COPY packages/emails/package.json packages/emails/
COPY packages/config-ts/package.json packages/config-ts/
COPY packages/config-eslint/package.json packages/config-eslint/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/apps ./apps
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @pagares/contracts --filter @pagares/domain-rules build
RUN pnpm --filter @pagares/web build

FROM node:22-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=build --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=app:app /app/apps/web/public ./apps/web/public

USER app
ENV NODE_ENV=production
ENV TZ=America/Mexico_City
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=256
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
