# syntax=docker/dockerfile:1
# API — imagen multi-etapa. Sólo la última etapa llega al VPS: las herramientas
# de compilación se quedan por el camino y no ocupan disco ni memoria en Dokploy.

FROM node:22-alpine AS base
RUN corepack enable && apk add --no-cache libc6-compat
WORKDIR /app

# ── Dependencias ──────────────────────────────────────────────────────────────
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

# ── Compilación ───────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/apps ./apps
COPY . .
RUN pnpm --filter @pagares/contracts --filter @pagares/domain-rules \
         --filter @pagares/api-core --filter @pagares/emails build
RUN pnpm --filter @pagares/api exec prisma generate
RUN pnpm --filter @pagares/api build
# El alta del primer administrador (§25.1) se hace en el servidor, así que su
# script viaja compilado: en la imagen final no hay TypeScript que lo ejecute.
# Se compila antes de podar, mientras el árbol de dependencias sigue completo.
RUN pnpm --filter @pagares/api exec tsc scripts/create-admin.ts \
      --outDir /tools --module nodenext --moduleResolution nodenext \
      --target es2022 --skipLibCheck

# Poda lo que sólo servía para compilar.
RUN pnpm --filter @pagares/api --prod --legacy deploy /out
# El cliente de Prisma se genera dentro del árbol podado: el generado en la
# etapa de compilación vive en el almacén de pnpm de /app, que aquí se tira.
RUN cp -r apps/api/prisma /out/prisma \
 && cd /out \
 && /app/apps/api/node_modules/.bin/prisma generate --schema=/out/prisma/schema.prisma

# ── Ejecución ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
RUN apk add --no-cache libc6-compat && addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=build --chown=app:app /out/node_modules ./node_modules
COPY --from=build --chown=app:app /app/apps/api/dist ./dist
COPY --from=build --chown=app:app /app/apps/api/prisma ./prisma
COPY --from=build --chown=app:app /tools ./tools

# Carpeta de los archivos. En Dokploy se monta aquí un volumen para que las
# firmas y los escaneos sobrevivan a los despliegues (§8).
RUN mkdir -p /data/storage && chown -R app:app /data
VOLUME ["/data/storage"]

USER app
ENV NODE_ENV=production
ENV STORAGE_DRIVER=local
ENV STORAGE_LOCAL_DIR=/data/storage
ENV TZ=America/Mexico_City
# Techo de heap: sin esto Node reserva según la RAM total de la máquina y en un
# VPS pequeño se lleva más de lo que necesita.
ENV NODE_OPTIONS=--max-old-space-size=320
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
