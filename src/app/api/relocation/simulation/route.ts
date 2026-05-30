import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const simulations = await prisma.relocationSimulation.findMany({
      orderBy: { updatedAt: 'desc' }
    });
    return NextResponse.json({ success: true, data: simulations });
  } catch (error: any) {
    console.error('Failed to resolve relocation simulations:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, name, steps } = body;

    if (!name || !steps || !Array.isArray(steps)) {
      return NextResponse.json({ success: false, error: 'Name and steps (array) are required' }, { status: 400 });
    }

    let record;
    if (id) {
      record = await prisma.relocationSimulation.update({
        where: { id },
        data: {
          name,
          steps: steps as any
        }
      });
    } else {
      record = await prisma.relocationSimulation.create({
        data: {
          name,
          steps: steps as any
        }
      });
    }

    return NextResponse.json({ success: true, data: record });
  } catch (error: any) {
    console.error('Failed to save relocation simulation:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing ID' }, { status: 400 });
    }

    await prisma.relocationSimulation.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Failed to delete relocation simulation:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
