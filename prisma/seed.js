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

        await prisma.blogPost.upsert({
            where: { slug: 'welcome' },
            update: {},
            create: {
                title: 'Welcome to My Portfolio',
                slug: 'welcome',
                content: '# Welcome\n\nThis is a test post to verify database connection.',
                excerpt: 'System check post.',
                tags: JSON.stringify(['System']),
                published: true,
                authorId: user.id,
            }
        });
        console.log('Seeded: Welcome Post');
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
