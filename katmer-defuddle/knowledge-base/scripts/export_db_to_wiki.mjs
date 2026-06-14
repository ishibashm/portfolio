import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL, // DIRECT_URLを使ってPgBouncerの影響を回避
    },
  },
});

async function main() {
  const rawDir = path.join(process.cwd(), "..", "llm-wiki", "raw");
  const obsidianDir = "C:\\Users\\ishib\\obsidian_vault\\Katmer_Sync";

  await fs.mkdir(rawDir, { recursive: true }).catch(() => {});
  await fs.mkdir(obsidianDir, { recursive: true }).catch(() => {});

  let count = 0;
  let skip = 0;
  const BATCH_SIZE = 10;
  let hasMore = true;

  console.log("Starting export in batches...");

  while (hasMore) {
    const docs = await prisma.knowledgeDocument.findMany({
      skip,
      take: BATCH_SIZE,
      orderBy: { created_at: "asc" },
    });

    if (docs.length === 0) {
      hasMore = false;
      break;
    }

    for (const doc of docs) {
      if (!doc.content) continue;

      // Create frontmatter
      const tagsStr = doc.tags ? doc.tags.map((t) => `"${t}"`).join(", ") : "";
      const yaml = [
        "---",
        `title: "${doc.title ? doc.title.replace(/"/g, '\\"') : "Untitled"}"`,
        `kb_id: "KB${String(doc.kb_id).padStart(6, "0")}"`,
        `created_at: "${doc.created_at.toISOString()}"`,
        `domain: "${doc.domain || "Uncategorized"}"`,
        `category: "${doc.category || "General"}"`,
        `tags: [${tagsStr}]`,
        "---",
      ].join("\n");

      let content = `${yaml}\n\n# ${doc.title || "Untitled"}\n\n${doc.content}`;

      const safeTitle = (doc.title || `KB${String(doc.kb_id).padStart(6, "0")}`)
        .replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/gi, "_")
        .toLowerCase();
      const fileName = `${String(doc.kb_id).padStart(4, "0")}_${safeTitle.slice(0, 50)}.md`;

      // llm-wiki には平坦に出力（Graphify等の互換性維持のため）
      const rawFilePath = path.join(rawDir, fileName);
      await fs.writeFile(rawFilePath, content, "utf-8");

      // Obsidian Vault には ドメイン > カテゴリ のフォルダ構造を作って出力
      const domainStr = (doc.domain || "Uncategorized").replace(
        /[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/gi,
        "_",
      );
      const categoryStr = (doc.category || "General").replace(
        /[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/gi,
        "_",
      );
      const targetDir = path.join(obsidianDir, domainStr, categoryStr);

      await fs.mkdir(targetDir, { recursive: true }).catch(() => {});
      const obsidianFilePath = path.join(targetDir, fileName);
      await fs.writeFile(obsidianFilePath, content, "utf-8");

      count++;
    }
    console.log(`Processed ${skip + docs.length} documents...`);
    skip += BATCH_SIZE;
  }

  console.log(
    `Successfully exported ${count} files to ${rawDir} and ${obsidianDir}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
