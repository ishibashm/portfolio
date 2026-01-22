const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
    // Voice-Pro Guide
    const voiceProPath = path.join(process.cwd(), 'docs', 'voice-pro-install-guide.md');
    if (fs.existsSync(voiceProPath)) {
        let content = fs.readFileSync(voiceProPath, 'utf-8');
        // Ensure image is present if not already
        if (!content.includes('![Voice-Pro Demo]')) {
            content = '![Voice-Pro Demo](/images/voice-pro-demo.png)\n\n' + content;
        }

        // Ensure User exists
        let user = await prisma.user.findFirst();
        if (!user) {
            user = await prisma.user.create({
                data: { email: 'admin@example.com', name: 'Admin' },
            });
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

    // 確実に表示されるテスト記事を追加
    const user = await prisma.user.findFirst();
    if (user) {
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
