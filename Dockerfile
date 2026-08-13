# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS base

# Install Python 3, pip, and system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-pandas \
    python3-numpy \
    python3-lxml \
    build-essential \
    python3-dev \
    libffi-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install yfinance and google-antigravity
# Use --break-system-packages as PEP 668 is active in debian bookworm
RUN pip3 install --no-cache-dir --break-system-packages yfinance google-antigravity

# Install dependencies only when needed
FROM base AS deps
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

# ブログ記事の Markdown。src/lib/blog.ts が process.cwd() を起点に
# 実行時へ読みに行くが、パスを組み立てて readFileSync するだけなので
# Next の output file tracing では追えず、standalone には入らない。
# 今は読み手が全部ビルド時（/blog は静的生成、feed.xml は force-static）
# なので表に出ていないが、実行時に読む口を 1 つ足した瞬間、例外ではなく
# **記事 0 件**が静かに返る（getBlogPosts はディレクトリが無いと [] を返す）。
COPY --from=builder --chown=nextjs:nodejs /app/content ./content

USER nextjs

EXPOSE 3000

ENV PORT=3000
# set hostname to localhost
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
