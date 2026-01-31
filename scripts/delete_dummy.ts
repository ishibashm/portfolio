
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Attempting to delete dummy posts...');
  
  const result1 = await prisma.blogPost.deleteMany({
      where: {
          OR: [
              { title: 'First Post' },
              { title: 'Hello World' },
              { title: { contains: '最初の記事' } }
          ]
      }
  });

  console.log(`Deleted ${result1.count} posts containing dummy titles.`);
}

main()
  .catch(console.error)
  .finally(async () => {
      await prisma.$disconnect();
  });
