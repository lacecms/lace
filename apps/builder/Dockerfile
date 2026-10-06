FROM node:24.12.0-bookworm-slim AS compile

RUN npm install --global pnpm@12.3.4
WORKDIR /build
COPY . .
RUN pnpm install --frozen-lockfile --filter @lacecms/app-builder... \
    && pnpm --filter @lacecms/app-builder build

FROM node:24.12.0-bookworm-slim
ARG LACE_VERSION=0.1.0-alpha.3
ARG LACE_REVISION=unrecorded
LABEL org.opencontainers.image.source="https://github.com/lacecms/lace" \
    org.opencontainers.image.version=$LACE_VERSION \
    org.opencontainers.image.revision=$LACE_REVISION
RUN apt-get update \
    && apt-get install --yes --no-install-recommends build-essential python3 \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@12.3.4 \
    && mkdir -p /source /work /output \
    && chown -R node:node /work /output
COPY --from=compile /build/apps/builder/dist /opt/lace-builder/dist
COPY --from=compile /build/LICENSE /opt/lace-builder/LICENSE
USER node
WORKDIR /opt/lace-builder
EXPOSE 8788
CMD ["node", "dist/main.js"]
