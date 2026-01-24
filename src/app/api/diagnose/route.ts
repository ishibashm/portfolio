import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Check Environment Variables (Masked)
    const dbUrl = process.env.DATABASE_URL || 'NOT_SET';

    // Mask password if present
    const maskedDbUrl = dbUrl === 'NOT_SET'
      ? 'NOT_SET'
      : dbUrl.replace(/:[^:]+@/, ':****@');

    // Extract path from file: protocol if present
    let dbPath = 'N/A';
    let dbExists = false;
    let cwd = process.cwd();
    let dbAbsolutePath = 'N/A';

    if (dbUrl.startsWith('file:')) {
      dbPath = dbUrl.replace('file:', '');
      // Resolve absolute path if it's relative
      if (!path.isAbsolute(dbPath)) {
        dbAbsolutePath = path.resolve(cwd, dbPath);
      } else {
        dbAbsolutePath = dbPath;
      }
      dbExists = fs.existsSync(dbAbsolutePath);
    }

    const envCheck = {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL_SET: dbUrl !== 'NOT_SET',
      DATABASE_URL_PREFIX: dbUrl.split(':')[0],
      DATABASE_PATH_CHECK: dbUrl.includes('file:') ? 'Looks like SQLite' : 'Not SQLite',
      NEXTAUTH_SECRET_SET: !!process.env.NEXTAUTH_SECRET,
      FS_CHECK: {
        CWD: cwd,
        DB_PATH_PARSED: dbPath,
        DB_ABSOLUTE_PATH: dbAbsolutePath,
        DB_FILE_EXISTS: dbExists
      }
    };

    // 2. Check Prisma Connection
    let dbStatus = 'Skipped (Prisma import active, usage disabled)';
    let userCount = -1;
    let errorDetail = null;

    /*
    if (!prisma) {
      dbStatus = 'Prisma Client Not Initialized';
    } else {
      try {
        // Attempt a simple query. Using a timeout if possible would be good, but Prisma doesn't support easy per-query timeout in V5 without extension?
        // simple count
        userCount = await prisma.user.count();
        dbStatus = 'Connected';
      } catch (e: any) {
        dbStatus = 'Connection Failed';
        errorDetail = {
          message: e.message,
          code: e.code,
          name: e.name,
          // stack: e.stack // Optional: include stack if safe
        };
      }
    }
    */

    return NextResponse.json({
      status: 'Diagnostic Complete',
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
      status: 'Diagnostic Crash (Unexpected)',
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
