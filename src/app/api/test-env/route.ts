import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const dbUrl = process.env.DATABASE_URL || '';
  
  // Mask password manually in the raw string to see exactly what it is
  let rawDbUrlMasked = 'Not Set';
  if (dbUrl) {
    rawDbUrlMasked = dbUrl.replace(/:([^:@]+)@/, ':***@');
  }

  const envFileExists = fs.existsSync('.env');
  let envFileContentMasked = 'None';
  if (envFileExists) {
    try {
      const content = fs.readFileSync('.env', 'utf-8');
      // Mask any database passwords in the file content
      envFileContentMasked = content.replace(/:([^:@]+)@/g, ':***@');
    } catch (e: any) {
      envFileContentMasked = `Error reading file: ${e.message}`;
    }
  }

  const parentEnvExists = fs.existsSync('../.env');
  let parentEnvContentMasked = 'None';
  if (parentEnvExists) {
    try {
      const content = fs.readFileSync('../.env', 'utf-8');
      parentEnvContentMasked = content.replace(/:([^:@]+)@/g, ':***@');
    } catch (e: any) {
      parentEnvContentMasked = `Error reading file: ${e.message}`;
    }
  }

  return NextResponse.json({
    rawDbUrlMasked,
    envFileExists,
    envFileContentMasked,
    parentEnvExists,
    parentEnvContentMasked,
    cwd: process.cwd()
  });
}
