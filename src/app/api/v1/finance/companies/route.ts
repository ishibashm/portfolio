import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const companies = await prisma.company.findMany({
      select: {
        company_name: true,
        edinet_code: true,
      },
      orderBy: {
        company_name: 'asc'
      }
    });

    return NextResponse.json({ 
      companies: companies.map(c => ({
        name: c.company_name,
        edinet_code: c.edinet_code
      }))
    });
  } catch (error: any) {
    console.error("Failed to fetch companies:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
