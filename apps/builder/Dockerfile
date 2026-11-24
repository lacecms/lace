FROM node:24.22.3-bookworm-slim AS compile

ENV npm_config_manage_package_manager_versions=false

RUN apt-get update \
    && apt-get install --yes --no-install-recommends build-essential python3 \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@12.21.0
WORKDIR /build
COPY . .
RUN pnpm install --frozen-lockfile --filter @lacecms/app-builder... --filter @lacecms/astro... \
    && pnpm --filter @lacecms/app-builder --filter @lacecms/astro... build \
    && pnpm --filter @lacecms/astro deploy --legacy --prod /runtime/preview-tools \
    && test -f /runtime/preview-tools/dist/preview-tool.js

FROM node:24.22.3-bookworm-slim

ENV npm_config_manage_package_manager_versions=false
ARG LACE_VERSION=1.1.0
ARG LACE_REVISION=unrecorded
LABEL org.opencontainers.image.source="https://github.com/lacecms/lace" \
    org.opencontainers.image.version=$LACE_VERSION \
    org.opencontainers.image.revision=$LACE_REVISION
RUN apt-get update \
    && apt-get install --yes --no-install-recommends build-essential python3 git tini \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@12.21.0 \
    && mkdir -p /source /work /output /cache \
    && chown -R node:node /work /output /cache
COPY --from=compile /build/apps/builder/dist /opt/lace-builder/dist
COPY --from=compile /build/LICENSE /opt/lace-builder/LICENSE
COPY --from=compile /runtime/preview-tools /opt/lace-preview-tools
USER node
WORKDIR /opt/lace-builder
EXPOSE 8788
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
