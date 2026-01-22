import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
    const dbPath = path.join(process.cwd(), 'dev.db');
    const prismaDbPath = path.join(process.cwd(), 'prisma', 'dev.db');

    const status = {
        env: {
            NODE_ENV: process.env.NODE_ENV,
            DATABASE_URL_SET: !!process.env.DATABASE_URL,
            // Masked URL
            DATABASE_URL: process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:.*@/, ':****@') : 'Not Set',
        },
        filesystem: {
            cwd: process.cwd(),
            root_db_exists: fs.existsSync(dbPath),
            prisma_db_exists: fs.existsSync(prismaDbPath),
        },
        database: {
            connected: false,
            user_count: -1,
            post_count: -1,
            error: null as string | null,
        },
        prisma_client: {
            initialized: !!prisma,
        }
    };

    if (prisma) {
        try {
            const users = await prisma.user.count();
            const posts = await prisma.blogPost.count();
            status.database.connected = true;
            status.database.user_count = users;
            status.database.post_count = posts;
        } catch (e: any) {
            status.database.error = e.message;
        }
    } else {
        status.database.error = 'Prisma Client not initialized';
    }

    return NextResponse.json(status, { status: 200 });
}
