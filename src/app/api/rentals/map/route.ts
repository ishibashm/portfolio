import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '500', 10);
    
    // Fetch properties that have coordinates
    const properties = await prisma.rental_properties.findMany({
      where: {
        lat: { not: null },
        lon: { not: null }
      },
      take: limit,
      orderBy: { created_at: 'desc' }
    });
    
    return NextResponse.json(properties);
  } catch (error) {
    console.error('Error fetching map properties:', error);
    return NextResponse.json({ error: 'Failed to fetch properties' }, { status: 500 });
  }
}
