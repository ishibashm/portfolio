import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const logPath = path.join(process.cwd(), 'public', 'debug.txt');
  let writeStatus = 'Unknown';
  let errorMsg = null;

  try {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `${timestamp}: BARE METAL DIAGNOSTIC START\n`);
    writeStatus = 'Success';
  } catch (e: any) {
    writeStatus = 'Failed';
    errorMsg = e.message;
  }

  return NextResponse.json({
    status: 'Bare Metal Diagnostic',
    test: 'File Write',
    target: logPath,
    result: writeStatus,
    error: errorMsg
  }, { status: 200 });
}
