FROM node:20-bookworm-slim AS build

WORKDIR /app

# Compile native dependencies such as better-sqlite3 in the build stage only.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/fvb.sqlite

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends libstdc++6 \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/data \
  && chown node:node /app/data

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json server.js database.js catalog-products.js auth-utils.js sqlite-session-store.js Catalogo.html ./
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/products').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
