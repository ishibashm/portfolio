import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import crypto from 'crypto';

export async function GET() {
  const dbUrl = process.env.DATABASE_URL || '';
  const directUrl = process.env.DIRECT_URL || '';
  
  let parsedDbUrl = 'Not Set';
  let dbPasswordLength = 0;
  let dbPasswordHash = '';
  let matchesLocalRaw = false;
  let matchesLocalEncoded = false;

  const localRaw = "fY9v/N/rs/.AbL#";
  const localEncoded = "fY9v%2FN%2Frs%2F.AbL%23";

  if (dbUrl) {
    try {
      const url = new URL(dbUrl);
      parsedDbUrl = `${url.protocol}//${url.username}:***@${url.host}${url.pathname}${url.search}`;
      dbPasswordLength = url.password.length;
      dbPasswordHash = crypto.createHash('md5').update(url.password).digest('hex');
      matchesLocalRaw = url.password === localRaw;
      matchesLocalEncoded = url.password === localEncoded;
    } catch (e: any) {
      parsedDbUrl = `Error parsing URL: ${e.message}`;
    }
  }

  let parsedDirectUrl = 'Not Set';
  if (directUrl) {
    try {
      const url = new URL(directUrl);
      parsedDirectUrl = `${url.protocol}//${url.username}:***@${url.host}${url.pathname}${url.search}`;
    } catch (e: any) {
      parsedDirectUrl = `Error parsing URL: ${e.message}`;
    }
  }

  // Try connecting using pg Pool
  let connectionStatus = 'Not Attempted';
  let connectionError = null;
  if (dbUrl) {
    const pool = new Pool({ connectionString: dbUrl, connectionTimeoutMillis: 5000 });
    try {
      const res = await pool.query('SELECT NOW()');
      connectionStatus = `Success: ${res.rows[0].now}`;
    } catch (err: any) {
      connectionStatus = 'Failed';
      connectionError = err.message;
    } finally {
      await pool.end();
    }
  }

  return NextResponse.json({
    parsedDbUrl,
    parsedDirectUrl,
    dbPasswordLength,
    dbPasswordHash,
    matchesLocalRaw,
    matchesLocalEncoded,
    connectionStatus,
    connectionError,
    nodeEnv: process.env.NODE_ENV,
  });
}
