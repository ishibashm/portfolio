import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Fetching blog posts...");
  const posts = await prisma.blogPost.findMany();
  console.log(`Found ${posts.length} posts.`);

  for (const p of posts) {
    console.log(`ID: ${p.id}, Title: "${p.title}", Slug: "${p.slug}"`);

    // Check for dummy content criteria
    if (
      p.title.includes("最初の記事") ||
      p.content.includes("中身のない記事") ||
      p.title === "First Post"
    ) {
      console.log(`-> Deleting dummy post: ${p.title}`);
      await prisma.blogPost.delete({ where: { id: p.id } });
      console.log("-> Deleted.");
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
