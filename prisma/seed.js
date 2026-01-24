const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
    // Ensure User exists
    let user = await prisma.user.findFirst();
    if (!user) {
        user = await prisma.user.create({
            data: { email: 'admin@example.com', name: 'Admin' },
        });
    }

    // Voice-Pro Guide
    const voiceProPath = path.join(process.cwd(), 'docs', 'voice-pro-install-guide.md');
    if (fs.existsSync(voiceProPath)) {
        let content = fs.readFileSync(voiceProPath, 'utf-8');
        // Ensure image is present if not already
        if (!content.includes('![Voice-Pro Demo]')) {
            content = '![Voice-Pro Demo](/images/voice-pro-demo.png)\n\n' + content;
        }

        await prisma.blogPost.upsert({
            where: { slug: 'voice-pro-install-guide' },
            update: {
                title: 'Voice-Pro: オールインワン動画・音声翻訳ツールのインストールガイド',
                content: content,
                excerpt: 'Voice-Proは、YouTube動画のダウンロード、音声分離、翻訳、多言語ダビングを統合したオープンソースツールです。本記事ではそのインストール手順を解説します。',
                tags: JSON.stringify(['Voice-Pro', 'AI', 'Tutorial']),
                published: true,
            },
            create: {
                title: 'Voice-Pro: オールインワン動画・音声翻訳ツールのインストールガイド',
                slug: 'voice-pro-install-guide',
                content: content,
                excerpt: 'Voice-Proは、YouTube動画のダウンロード、音声分離、翻訳、多言語ダビングを統合したオープンソースツールです。本記事ではそのインストール手順を解説します。',
                tags: JSON.stringify(['Voice-Pro', 'AI', 'Tutorial']),
                published: true,
                authorId: user.id,
            },
        });
        console.log('Seeded: Voice-Pro Guide');
    }

    // Troubleshooting Guide
    const troubleshootingContent = `
# Troubleshooting: Fixing "Internal Server Error" in Next.js 16 + Prisma Deployment

When deploying a Next.js 16 application with Prisma to a Linux environment (like Google Cloud Run or a VPS) from a Windows development machine, you might encounter a 500 Internal Server Error. Diagnostic logs often reveal the culprit:

\`Error: Cannot find module '@prisma/client-...'\`

This article documents why this happens and how to fix it.

## The Problem: Environment Mismatch

The root cause is a mismatch between how **pnpm on Windows** resolves dependencies versus how **npm on Linux** expects them, combined with Next.js 16's default bundler, **Turbopack**.

1.  **Build Time (Windows)**: Next.js/Turbopack "bakes in" the file paths of the Prisma Client optimized for Windows.
2.  **Runtime (Linux)**: The application tries to load those specific Windows paths or binaries, which don't exist in the Linux container.

## The Solution

We implemented a robust fix involving three layers:

### 1. Force Runtime Resolution

We modified \`src/lib/prisma.ts\` to use a dynamic \`require\` instead of a static \`import\`. This forces the application to look up the Prisma Client in the *current* environment's \`node_modules\` folder at runtime, ignoring whatever path was calculated at build time.

\`\`\`typescript
const { PrismaClient } = require('@prisma/client');
\`\`\`

### 2. Externalize Prisma

We updated \`next.config.ts\` to explicitly tell Webpack to treat Prisma as an external package. This prevents the bundler from trying to package the binary or optimize imports.

\`\`\`typescript
const nextConfig: NextConfig = {
  serverExternalPackages: ["prisma", "@prisma/client"],
  webpack: (config, { isServer }) => {
    if (isServer) {
        config.externals.push("prisma", "@prisma/client");
    }
    return config;
  },
};
\`\`\`

### 3. Force Webpack Build

Since Next.js 16 uses Turbopack by default (which might handle externals differently), we modified \`package.json\` to explicitly use Webpack for the build process.

\`\`\`json
"build": "next build --webpack && next-sitemap"
\`\`\`

## Conclusion

By stripping away build-time optimizations for the database client and forcing runtime resolution, we ensure that the application always connects using the correct binary for the operating system it is running on.
`;

    // Antigravity Guide
    const antigravityPath = path.join(process.cwd(), 'docs', 'google-antigravity-guide.md');
    if (fs.existsSync(antigravityPath)) {
        const content = fs.readFileSync(antigravityPath, 'utf-8');
        await prisma.blogPost.upsert({
            where: { slug: 'google-antigravity-guide' },
            update: {
                title: '【完全ガイド】Google Antigravityとは？日本語化と導入・実践ガイド',
                content: content,
                excerpt: 'Google Antigravityは指示だけで開発が完結する完全自律型AIです。Cursorとの違いやハンズオン形式でのアプリ作成手順を徹底解説。',
                tags: JSON.stringify(['AI', 'Antigravity', 'Google', 'DevTools']),
                published: true,
                publishedAt: new Date('2026-01-24T17:42:28'),
                authorId: user.id
            },
            create: {
                title: '【完全ガイド】Google Antigravityとは？日本語化と導入・実践ガイド',
                slug: 'google-antigravity-guide',
                content: content,
                excerpt: 'Google Antigravityは指示だけで開発が完結する完全自律型AIです。Cursorとの違いやハンズオン形式でのアプリ作成手順を徹底解説。',
                tags: JSON.stringify(['AI', 'Antigravity', 'Google', 'DevTools']),
                published: true,
                publishedAt: new Date('2026-01-24T17:42:28'),
                authorId: user.id,
            },
        });
        console.log('Seeded: Antigravity Guide');
    }

    // OpenCode Guide
    const opencodePath = path.join(process.cwd(), 'docs', 'opencode-glm47-guide.md');
    if (fs.existsSync(opencodePath)) {
        const content = fs.readFileSync(opencodePath, 'utf-8');
        await prisma.blogPost.upsert({
            where: { slug: 'opencode-glm47-guide' },
            update: {
                title: 'OpenCodeとGLM 4.7で始める無課金コーディングエージェント',
                content: content,
                excerpt: 'アカウント登録不要・完全無料で使えるコーディングエージェント「OpenCode」と「GLM 4.7」の導入からTODOアプリ作成までを体験レビュー。',
                tags: JSON.stringify(['AI', 'OpenSource', 'Coding Agent']),
                published: true,
                publishedAt: new Date('2026-01-24T17:42:53'),
                authorId: user.id
            },
            create: {
                title: 'OpenCodeとGLM 4.7で始める無課金コーディングエージェント',
                slug: 'opencode-glm47-guide',
                content: content,
                excerpt: 'アカウント登録不要・完全無料で使えるコーディングエージェント「OpenCode」と「GLM 4.7」の導入からTODOアプリ作成までを体験レビュー。',
                tags: JSON.stringify(['AI', 'OpenSource', 'Coding Agent']),
                published: true,
                publishedAt: new Date('2026-01-24T17:42:53'),
                authorId: user.id,
            },
        });
        console.log('Seeded: OpenCode Guide');
    }

    // AI Video Editing Guide
    const aiVideoPath = path.join(process.cwd(), 'docs', 'ai-video-editing-guide.md');
    if (fs.existsSync(aiVideoPath)) {
        const content = fs.readFileSync(aiVideoPath, 'utf-8');
        await prisma.blogPost.upsert({
            where: { slug: 'ai-video-editing-guide' },
            update: {
                title: 'AI動画編集の教科書：AI×Remotionでテキストから動画を作る',
                content: content,
                excerpt: '動画編集はAIに任せる時代へ。テキスト指示だけで動画を生成する「AI×Remotion」の仕組みと、Antigravityを使った環境構築方法を解説。',
                tags: JSON.stringify(['AI', 'Video Editing', 'Remotion', 'Tutorial']),
                published: true,
                publishedAt: new Date('2026-01-24T20:37:17'),
                authorId: user.id
            },
            create: {
                title: 'AI動画編集の教科書：AI×Remotionでテキストから動画を作る',
                slug: 'ai-video-editing-guide',
                content: content,
                excerpt: '動画編集はAIに任せる時代へ。テキスト指示だけで動画を生成する「AI×Remotion」の仕組みと、Antigravityを使った環境構築方法を解説。',
                tags: JSON.stringify(['AI', 'Video Editing', 'Remotion', 'Tutorial']),
                published: true,
                publishedAt: new Date('2026-01-24T20:37:17'),
                authorId: user.id,
            },
        });
        console.log('Seeded: AI Video Editing Guide');
    }

    if (user) {
        await prisma.blogPost.upsert({
            where: { slug: 'troubleshooting-deployment' },
            update: {
                title: 'Fixing Internal Server Errors: Next.js 16 & Prisma',
                content: troubleshootingContent,
                excerpt: 'How we solved the "Cannot find module" crash when deploying Next.js 16 apps with Prisma from Windows to Linux.',
                tags: JSON.stringify(['Engineering', 'Next.js', 'Prisma', 'DevOps']),
                published: true,
                publishedAt: new Date(),
            },
            create: {
                title: 'Fixing Internal Server Errors: Next.js 16 & Prisma',
                slug: 'troubleshooting-deployment',
                content: troubleshootingContent,
                excerpt: 'How we solved the "Cannot find module" crash when deploying Next.js 16 apps with Prisma from Windows to Linux.',
                tags: JSON.stringify(['Engineering', 'Next.js', 'Prisma', 'DevOps']),
                published: true,
                authorId: user.id,
                publishedAt: new Date(),
            },
        });
        console.log('Seeded: Troubleshooting Guide');

    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
