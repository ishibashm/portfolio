import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // 1. Check Environment Variables (Masked)
        const dbUrl = process.env.DATABASE_URL || 'NOT_SET';
        const maskedDbUrl = dbUrl === 'NOT_SET'
            ? 'NOT_SET'
            : dbUrl.replace(/:[^:]+@/, ':****@'); // Mask password if present

        const envCheck = {
            NODE_ENV: process.env.NODE_ENV,
            DATABASE_URL_SET: dbUrl !== 'NOT_SET',
            DATABASE_URL_PREFIX: dbUrl.split(':')[0],
            DATABASE_PATH_CHECK: dbUrl.includes('file:') ? 'Looks like SQLite' : 'Not SQLite',
        };

        // 2. Check Prisma Connection
        let dbStatus = 'Unknown';
        let userCount = -1;
        let errorDetail = null;

        if (!prisma) {
            dbStatus = 'Prisma Client Not Initialized';
        } else {
            try {
                // Attempt a simple query
                userCount = await prisma.user.count();
                dbStatus = 'Connected';
            } catch (e: any) {
                dbStatus = 'Connection Failed';
                errorDetail = {
                    message: e.message,
                    code: e.code,
                    meta: e.meta,
                    name: e.name
                };
            }
        }

        return NextResponse.json({
            status: 'Diagnostic Check Pending',
            timestamp: new Date().toISOString(),
            environment: envCheck,
            database: {
                status: dbStatus,
                userCount,
                error: errorDetail
            }
        }, { status: 200 });

    } catch (error: any) {
        return NextResponse.json({
            status: 'Diagnostic Crash',
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}
