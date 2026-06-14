import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";

const prisma = new PrismaClient();

// The user ID needs to be a valid UUID. Using local-user.
const SYSTEM_USER_ID = "local-user";

async function ensureSystemUser() {
  const user = await prisma.user.findUnique({
    where: { id: SYSTEM_USER_ID },
  });
  if (!user) {
    await prisma.user.create({
      data: {
        id: SYSTEM_USER_ID,
        name: "System Importer",
        email: "system@localhost",
      },
    });
    console.log("[INFO] Created SYSTEM_USER_ID in User table.");
  }
}

async function processMarkdownFiles(dir: string) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      await processMarkdownFiles(fullPath);
    } else if (file.endsWith(".md")) {
      await importMarkdownFile(fullPath);
    }
  }
}

async function importMarkdownFile(filePath: string) {
  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    const { data: frontmatter, content } = matter(fileContent);

    // Extract title from frontmatter, or fallback to first H1, or filename without extension
    let title = frontmatter.title;
    if (!title) {
      const h1Match = content.match(/^#\s+(.*)$/m);
      title = h1Match ? h1Match[1].trim() : path.basename(filePath, ".md");
    }

    // タイトルを分かりやすくする（タイムスタンプを取り除く）
    // 例: 2025-07-16T193228+0900_Kling 2.1... -> Kling 2.1...
    // 例: 20240626113000-Zettelkastenの... -> Zettelkastenの...
    title = title.replace(/^\d{4}-\d{2}-\d{2}T\d{6}\+\d{4}_/, "");
    title = title.replace(/^\d{14}-/, "");
    title = title.trim();

    const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];

    // パスからドメイン、カテゴリ、ステータスを推論
    let domain = frontmatter.domain || "Obsidian";
    let category = frontmatter.category || "Uncategorized";
    let status = frontmatter.status || "Published";

    const normalizedPath = filePath.replace(/\\/g, "/");

    // obsidian_vault内のフォルダ構造からカテゴリを抽出
    const obsidianMatch = normalizedPath.match(
      /\/obsidian_vault\/(.+)\/[^/]+$/,
    );
    if (obsidianMatch) {
      let relPath = obsidianMatch[1];

      // フォルダベースのステータス付与（Zettelkasten仕様）
      if (relPath.startsWith("00_inbox")) {
        status = "Inbox";
        relPath = relPath.replace(/^00_inbox\/?/, "");
      } else if (relPath.startsWith("20_Literature")) {
        status = "Literature";
        relPath = relPath.replace(/^20_Literature\/?/, "");
      } else if (relPath.startsWith("30_Permanent")) {
        status = "Permanent";
        relPath = relPath.replace(/^30_Permanent\/?/, "");
      } else if (relPath.startsWith("40_Drafts")) {
        status = "Draft";
        relPath = relPath.replace(/^40_Drafts\/?/, "");
      }

      // 残ったフォルダパスをカテゴリとして設定（例: "AI/LLM"）
      if (relPath && !frontmatter.category) {
        category = relPath;
      }
    } else {
      // それ以外のフォルダの場合のフォールバック
      if (normalizedPath.includes("/00_inbox/")) {
        status = "Inbox";
      } else if (normalizedPath.includes("/20_Literature/")) {
        status = "Literature";
      } else if (normalizedPath.includes("/30_Permanent/")) {
        status = "Permanent";
      } else if (normalizedPath.includes("/40_Drafts/")) {
        status = "Draft";
      }
    }

    // Check if the document with same title exists (simple deduplication strategy)
    const existing = await prisma.knowledgeDocument.findFirst({
      where: { title: title },
    });

    if (existing) {
      // 既存ドキュメントのメタデータ（カテゴリやステータス）が古ければ更新する
      if (
        existing.category !== category ||
        existing.status !== status ||
        existing.domain !== domain
      ) {
        await prisma.knowledgeDocument.update({
          where: { id: existing.id },
          data: {
            category: category,
            status: status,
            domain: domain,
            tags: tags,
          },
        });
        console.log(
          `[Updated] Document metadata updated: ${title} (Category: ${category}, Status: ${status})`,
        );
      } else {
        console.log(`[Skip] Document already up-to-date: ${title}`);
      }
    } else {
      const doc = await prisma.knowledgeDocument.create({
        data: {
          user_id: SYSTEM_USER_ID,
          title: title,
          content: content,
          tags: tags,
          domain: domain,
          category: category,
          status: status,
          type: "Note",
        },
      });
      console.log(
        `[Added] Created document: ${doc.title} (KB${String(doc.kb_id).padStart(6, "0")})`,
      );
    }
  } catch (error) {
    console.error(`[Error] Failed to process ${filePath}:`, error);
  }
}

async function main() {
  const workspaceRoot = path.resolve(__dirname, "../../..");
  const targetDirs = [
    // プロジェクト関連（doc と docs の両方を含める）
    path.join(workspaceRoot, "katmer-defuddle/llm-wiki/raw"),
    path.join(workspaceRoot, "docs"),
    path.join(workspaceRoot, "doc"), // 追加
    path.join(workspaceRoot, "katmer-defuddle/katmer-code/src/skills"),
    path.join(workspaceRoot, "reports"),
    path.join(workspaceRoot, "plans"),

    // ローカルフォルダ
    "C:\\Users\\ishib\\obsidian_vault", // これがあれば配下の clip や Clippings も探索される
    "D:\\Documents\\作業用",
  ];

  console.log("Starting Markdown import to PostgreSQL...");
  await ensureSystemUser();

  for (const dir of targetDirs) {
    if (fs.existsSync(dir)) {
      console.log(`Processing directory: ${dir}`);
      await processMarkdownFiles(dir);
    } else {
      console.warn(`Directory not found: ${dir}`);
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
    console.log("Done.");
  });
