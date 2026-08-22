# syntax=docker/dockerfile:1
# Python も apt も入れない。**素の Node イメージだけ。**
#
# ## なぜ外したか
#
# ここには以前 apt で python3 / pandas / numpy / lxml / build-essential /
# python3-dev / libffi-dev / libssl-dev を入れ、pip で yfinance を入れていた。
# **合わせて 186 MB のレイヤーになる。**
#
# GitHub Actions のランナーにはレイヤーキャッシュが無いので、apt の
# インデックスが毎回変わり、**デプロイのたびに新しいダイジェストの
# 186 MB が Artifact Registry に積まれていた。**実測で 4,352 レイヤー・
# 124.7 GB のうち、100 MB 超が 376 レイヤー・68.3 GB を占めていた。
#
# ## 消せた理由
#
# Python を呼んでいたのは /api/omni/predict と /api/omni/stock の 2 本だけで、
# **どちらも誰からも呼ばれていなかった**（#505 で削除）。predict に至っては
# 存在しないスクリプトを指していて、呼ばれても必ず失敗する状態だった。
#
# build-essential は pip のビルド用で、**npm 側は要らない。**ネイティブ拡張が
# 無く（binding.gyp 0 件）、lightningcss は事前ビルド済みバイナリで入る。
#
# libssl も要らない。**Prisma 7 は WASM の query compiler を使う**
# （query_compiler_fast_bg.wasm。libquery_engine のような Rust バイナリは
# 1 つも無い）。
#
# ## 戻すとき
#
# Python が要る処理を足すなら、**この base ではなくその段だけに入れること。**
# base に戻すと runner にも乗り、また同じことになる。
FROM node:20-bookworm-slim AS base

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
