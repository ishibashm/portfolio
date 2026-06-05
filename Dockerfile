# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

# Install Python 3, pip, and pre-compiled Pandas, Numpy, and LXML
RUN apk add --no-cache python3 py3-pip py3-pandas py3-numpy py3-lxml && \
    ln -sf /usr/bin/python3 /usr/bin/python

# Install yfinance in system packages with build dependencies
RUN apk add --no-cache --virtual .build-deps gcc g++ musl-dev python3-dev libffi-dev openssl-dev make && \
    pip install --no-cache-dir --break-system-packages yfinance && \
    apk del .build-deps

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js telemetry is disabled
ENV NEXT_TELEMETRY_DISABLED=1

RUN --mount=type=secret,id=env,target=.env npx prisma generate
RUN --mount=type=secret,id=env,target=.env npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma schema and engine to ensure it runs correctly in standalone mode
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs

EXPOSE 3000

ENV PORT=3000
# set hostname to localhost
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
