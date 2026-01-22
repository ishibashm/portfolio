const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
    const filePath = path.join(process.cwd(), 'docs', 'voice-pro-install-guide.md');
    let content = fs.readFileSync(filePath, 'utf-8');

    // 画像を追加してリッチにする
    content = '![Voice-Pro Demo](/images/voice-pro-demo.png)\n\n' + content;

    // ダミーのUserを作成するか、既存のUserを取得する
    // Userがいないと作成できない可能性があるため、まずはUserを確認
    let user = await prisma.user.findFirst();

    if (!user) {
        console.log('Creating a dummy user for the author...');
        user = await prisma.user.create({
            data: {
                email: 'admin@example.com',
                name: 'Admin',
            },
        });
    }

    const post = await prisma.blogPost.upsert({
        where: { slug: 'voice-pro-install-guide' },
        update: {
            title: 'Voice-Pro: オールインワン動画・音声翻訳ツールのインストールガイド',
            content: content,
            excerpt: 'Voice-Proは、YouTube動画のダウンロード、音声分離、翻訳、多言語ダビングを統合したオープンソースツールです。本記事ではそのインストール手順を解説します。',
            tags: JSON.stringify(['Voice-Pro', 'AI', 'Tutorial', 'Open Source']),
            published: true,
            updatedAt: new Date(),
        },
        create: {
            title: 'Voice-Pro: オールインワン動画・音声翻訳ツールのインストールガイド',
            slug: 'voice-pro-install-guide',
            content: content,
            excerpt: 'Voice-Proは、YouTube動画のダウンロード、音声分離、翻訳、多言語ダビングを統合したオープンソースツールです。本記事ではそのインストール手順を解説します。',
            tags: JSON.stringify(['Voice-Pro', 'AI', 'Tutorial', 'Open Source']),
            published: true,
            authorId: user.id,
        },
    });

    console.log(`Created/Updated post: ${post.title}`);
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
