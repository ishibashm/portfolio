import { NextResponse } from 'next/server';
import { prisma, initializationError } from '@/lib/prisma';
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

    const nodeModulesPath = path.join(process.cwd(), 'node_modules');
    const prismaClientPath = path.join(nodeModulesPath, '@prisma', 'client');
    const dotPrismaClientPath = path.join(nodeModulesPath, '.prisma', 'client');

    const listFiles = (dir: string) => {
      try {
        return fs.existsSync(dir) ? fs.readdirSync(dir) : ['(Directory Not Found)'];
      } catch (e: any) {
        return [`Error: ${e.message}`];
      }
    };

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
        DB_FILE_EXISTS: dbExists,
        PRISMA_CLIENT_FILES: listFiles(prismaClientPath),
        DOT_PRISMA_CLIENT_FILES: listFiles(dotPrismaClientPath)
      }
    };

    // 2. Check Prisma Connection
    let dbStatus = 'Initiating...';
    let userCount = -1;
    let errorDetail = null;

    const logPath = path.join(process.cwd(), 'public', 'debug.txt');
    const log = (msg: string) => {
      try {
        fs.appendFileSync(logPath, `${new Date().toISOString()}: ${msg}\n`);
      } catch (e) { /* ignore log error */ }
    };

    log('Starting Diagnostic Check via API');

    if (!prisma) {
      dbStatus = 'Prisma Client Not Initialized';
      log('Prisma Client is null/undefined');
      if (initializationError) {
        errorDetail = {
          phase: 'Initialization',
          message: initializationError.message,
          name: initializationError.name,
          stack: initializationError.stack
        };
      }
    } else {
      try {
        log('Prisma Client exists. Attempting user.count()...');
        // Attempt a simple query
        userCount = await prisma.user.count();
        log(`Query Success! Count: ${userCount}`);
        dbStatus = 'Connected';
      } catch (e: any) {
        dbStatus = 'Connection Failed';
        log(`Query Failed: ${e.message}`);
        errorDetail = {
          message: e.message,
          code: e.code,
          name: e.name,
          // stack: e.stack // Optional: include stack if safe
        };
      }
    }

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
