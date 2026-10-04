FROM node:24.12.0-bookworm-slim AS compile

RUN apt-get update \
    && apt-get install --yes --no-install-recommends build-essential python3 \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@12.3.4
WORKDIR /opt/lace/workspace
COPY . .
RUN pnpm install --frozen-lockfile \
    && pnpm --filter @lacecms/app-admin... build \
    && pnpm --filter @lacecms/app-api... build \
    && pnpm --filter @lacecms/app-api deploy --legacy --prod /runtime/apps/api \
    && node scripts/make-api-runtime.mjs /runtime \
    && mkdir -p /runtime/apps/admin \
    && cp -R apps/admin/dist /runtime/apps/admin/dist

FROM node:24.12.0-bookworm-slim
ARG LACE_VERSION=0.1.0-alpha.2
ARG LACE_REVISION=unrecorded
LABEL org.opencontainers.image.source="https://github.com/lacecms/lace" \
    org.opencontainers.image.version=$LACE_VERSION \
    org.opencontainers.image.revision=$LACE_REVISION
WORKDIR /opt/lace/workspace
COPY --from=compile /runtime/ ./

ENV NODE_ENV=production \
    LACE_ADMIN_DIST=/opt/lace/workspace/apps/admin/dist
EXPOSE 3000
CMD ["node", "apps/api/dist/production.js"]
