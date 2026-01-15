# Structure based off
# https://pnpm.io/docker#example-1-build-a-bundle-in-a-docker-container
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY . /app
WORKDIR /app

FROM base AS build
RUN --mount=type=cache,id=pnpm-build,target=/pnpm/store pnpm install --frozen-lockfile
# Run a full build (of dev and prod dependencies).
# We can't just use `pnpm install --prod`, otherwise `matrix-bot-sdk` won't get
# built.
# TODO: add a postinstall script to matrix-bot-sdk to build on install.
RUN pnpm run build
# Prune dev dependencies to reduce final image size.
RUN pnpm prune --prod

FROM base
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/lib /app/lib
COPY --from=build /app/srv /app/srv
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/pnpm-lock.yaml /app/pnpm-lock.yaml

WORKDIR /app
ENV NODE_CONFIG_DIR=/data/config
ENV NODE_ENV=production
ENV CONF_TEMPLATES_PATH=/app/srv

VOLUME ["/data"]
EXPOSE 8080

CMD node /app/lib/index.js
