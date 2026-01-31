
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const posts = await prisma.blogPost.findMany();
  console.log(`--- Blog Posts (${posts.length}) ---`);
  posts.forEach(p => {
      console.log(`[${p.id}] "${p.title}" (slug: ${p.slug})`);
  });
}

main()
  .finally(async () => {
      await prisma.$disconnect();
  });
