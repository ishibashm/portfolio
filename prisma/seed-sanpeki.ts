
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Base URL for Supabase Storage
const STORAGE_BASE = "https://ymqiqscelqqkozqwoiko.supabase.co/storage/v1/object/public/portfolio-assets/sanpeki";

// Filenames as they exist in Storage (including the renamed Year Plate)
const yearPlateFile = "202600.png"; // Renamed from 2026年年盤.png
const monthPlates = [
    "20261.png", "20262.png", "20263.png", "20264.png", 
    "20265.png", "20266.png", "20267.png", "20268.png", 
    "20269.png", "202610.png", "202611.png", "202612.png"
];

async function main() {
  console.log('Start seeding 2026 Sanpeki images (Supabase Storage)...');

  await prisma.portfolioImage.deleteMany({
      where: { projectId: 'sanpeki-ki' }
  });

  // 1. Year Plate
  await prisma.portfolioImage.create({
      data: {
          projectId: 'sanpeki-ki',
          url: `${STORAGE_BASE}/${yearPlateFile}`, 
          caption: '2026 Year Plate (2026年 年盤)',
          order: 0
      }
  });

  // 2. Month Plates
  for (let i = 0; i < monthPlates.length; i++) {
    const filename = monthPlates[i];
    const monthStr = filename.replace('2026', '').replace('.png', '');
    
    await prisma.portfolioImage.create({
      data: {
        projectId: 'sanpeki-ki',
        url: `${STORAGE_BASE}/${filename}`,
        caption: `2026 Month ${monthStr} (2026年 ${monthStr}月盤)`,
        order: i + 1
      }
    });
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
      await prisma.$disconnect();
  });
