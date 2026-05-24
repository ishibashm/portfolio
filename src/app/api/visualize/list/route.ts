import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const components = await prisma.visualizedComponent.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ success: true, components });
  } catch (error: any) {
    console.error('Error fetching visualized components:', error);
    return NextResponse.json({ error: 'Failed to fetch components' }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic'; // Prevent dynamic caching of listing API
