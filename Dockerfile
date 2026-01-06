# Structure based off
# https://pnpm.io/docker#example-1-build-a-bundle-in-a-docker-container
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY . /app
WORKDIR /app

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm-prod,target=/pnpm/store pnpm install --prod --frozen-lockfile

# MUST fork off base, not prod-deps, because `--prod` will cause `matrix-bot-sdk` to not
# emit `.d.ts` type declaration files in its built package (and it won't be rebuilt).
FROM base AS build
# Separate cache from the `--prod` install, for the same reason:
RUN --mount=type=cache,id=pnpm-build,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM base
COPY --from=prod-deps /app/node_modules /app/node_modules
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
