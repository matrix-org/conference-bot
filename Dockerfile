FROM node:14-alpine AS builder

COPY ./ /app/
WORKDIR /app
RUN yarn install

# Set NODE_ENV after install to trick webpack but not `yarn install`
ENV NODE_ENV=production
RUN yarn build

FROM node:14-alpine

COPY --from=builder /app/lib /app/lib
COPY --from=builder /app/srv /app/srv
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/yarn.lock /app/yarn.lock

WORKDIR /app
ENV NODE_CONFIG_DIR=/data/config
ENV NODE_ENV=production
ENV CONF_TEMPLATES_PATH=/app/srv
RUN yarn install

VOLUME ["/data"]
EXPOSE 8080

CMD node /app/lib/index.js
