import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const JQUANTS_BASE_URL = "https://api.jquants.com/v2";

async function main() {
  const apiKey = process.env.JQUANTS_API_KEY;
  if (!apiKey) {
    console.error("JQUANTS_API_KEY is not defined in env.");
    process.exit(1);
  }

  // 1. Fetch from J-Quants
  const url = `${JQUANTS_BASE_URL}/equities/master`;
  console.log("Fetching equities master from J-Quants...");
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "x-api-key": apiKey,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`J-Quants API Error (${response.status}):`, text);
    process.exit(1);
  }

  const payload: any = await response.json();
  const dataList = payload.info || payload.data || [];
  console.log(`Fetched ${dataList.length} companies.`);

  if (dataList.length === 0) {
    console.log("No data fetched. Exiting.");
    return;
  }

  // 2. Connect to DB
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    console.log("Starting bulk upsert into companies table...");
    
    // Chunk size
    const chunkSize = 1000;
    for (let i = 0; i < dataList.length; i += chunkSize) {
      const chunk = dataList.slice(i, i + chunkSize);
      
      // Build query
      // Columns: edinet_code, security_code, company_name, industry_code, updated_at
      const valueStrings: string[] = [];
      const values: any[] = [];
      
      chunk.forEach((item: any, index: number) => {
        const offset = index * 4;
        valueStrings.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, NOW())`);
        
        // edinet_code: 5-digit J-Quants code
        const edinet_code = item.Code;
        // security_code: 4-digit code (first 4 digits of 5-digit code)
        const security_code = item.Code ? item.Code.slice(0, 4) : null;
        const company_name = item.CoName || "";
        const industry_code = item.S33 || null;
        
        values.push(edinet_code, security_code, company_name, industry_code);
      });
      
      const query = `
        INSERT INTO companies (edinet_code, security_code, company_name, industry_code, updated_at)
        VALUES ${valueStrings.join(', ')}
        ON CONFLICT (edinet_code) 
        DO UPDATE SET 
          security_code = EXCLUDED.security_code,
          company_name = EXCLUDED.company_name,
          industry_code = EXCLUDED.industry_code,
          updated_at = NOW()
      `;
      
      await client.query(query, values);
      console.log(`Upserted chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(dataList.length / chunkSize)}`);
    }
    
    console.log("Synchronization completed successfully.");
  } catch (e: any) {
    console.error("Database synchronization failed:", e.message);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
