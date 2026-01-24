import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const logPath = path.join(process.cwd(), 'public', 'debug.txt');
  const dbPath = path.join(process.cwd(), 'dev.db');

  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    cwd: process.cwd(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL ? '(Set)' : '(Not Set)',
      // SQLite paths often start with file:
      DATABASE_URL_PREFIX: process.env.DATABASE_URL?.split(':')[0]
    },
    fs: {
      publicWrite: 'Unknown',
      dbExists: false,
      dbStats: null,
      prismaFiles: []
    },
    db: {
      connection: 'Unknown',
      error: null
    }
  };

  // 1. File Write Test
  try {
    fs.appendFileSync(logPath, `${diagnostics.timestamp}: BARE METAL DIAGNOSTIC START\n`);
    diagnostics.fs.publicWrite = 'Success';
  } catch (e: any) {
    diagnostics.fs.publicWrite = `Failed: ${e.message}`;
  }

  // 2. DB File Check
  try {
    if (fs.existsSync(dbPath)) {
      diagnostics.fs.dbExists = true;
      const stats = fs.statSync(dbPath);
      diagnostics.fs.dbStats = {
        size: stats.size,
        mode: (stats.mode & 0o777).toString(8), // Octal permissions
        uid: stats.uid,
        gid: stats.gid
      };
    } else {
      diagnostics.fs.dbExists = false;
      // Check if it's in prisma/ folder
      const prismaDbPath = path.join(process.cwd(), 'prisma', 'dev.db');
      if (fs.existsSync(prismaDbPath)) {
        diagnostics.fs.dbInPrismaDir = true;
      }
    }
  } catch (e: any) {
    diagnostics.fs.dbCheckError = e.message;
  }

  // 3. Prisma Files Check
  try {
    const prismaDir = path.join(process.cwd(), 'prisma');
    if (fs.existsSync(prismaDir)) {
      diagnostics.fs.prismaFiles = fs.readdirSync(prismaDir);
    } else {
      diagnostics.fs.prismaFiles = 'prisma dir not found';
    }
  } catch (e: any) {
    diagnostics.fs.prismaFilesError = e.message;
  }

  // 4. DB Connection Test
  try {
    // Try a simple query
    await prisma.$queryRaw`SELECT 1`;
    diagnostics.db.connection = 'Success';
  } catch (e: any) {
    diagnostics.db.connection = 'Failed';
    diagnostics.db.error = {
      message: e.message,
      code: e.code,
      meta: e.meta,
      name: e.name
    };
  }

  return NextResponse.json(diagnostics, { status: 200 });
}
