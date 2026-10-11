# Separate Node service; the existing Next.js standalone Dockerfile is unchanged.
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma/schema.prisma prisma/schema.prisma
RUN npm ci --ignore-scripts --no-audit --no-fund && npx prisma generate && npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --chown=node:node oauth-service ./oauth-service
USER node
EXPOSE 8080
CMD ["node", "oauth-service/server.mjs"]
