
import { PrismaClient } from '@prisma/client';
import SanpekiClient from './SanpekiClient';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic'; // Ensure it fetches fresh data

export default async function SanpekiPage() {
  const images = await prisma.portfolioImage.findMany({
      where: { projectId: 'sanpeki-ki' },
      orderBy: { order: 'asc' }
  });

  return <SanpekiClient images={images} />;
}
