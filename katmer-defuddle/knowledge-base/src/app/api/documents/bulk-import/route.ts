import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateText } from "ai";
import { getUserApiKey } from "@/app/settings/actions";
import path from "path";
import fs from "fs/promises";

// Reuse AI categorization logic from the regular documents route
async function categorizeAndTag(
  title: string,
  content: string,
  user_id: string,
) {
  let tags: string[] = [];
  let category = "Uncategorized";
  let domain = "General";
  let status = "Draft";
  let priority = "Medium";
  let type = "Note";

  const disableAutoTagging = process.env.DISABLE_AI_AUTO_TAGGING === "true";
  if (disableAutoTagging)
    return { tags, category, domain, status, priority, type };

  let existingCategoriesStr = "None";
  try {
    const distinctCats = await prisma.knowledgeDocument.findMany({
      where: { user_id, category: { not: null } },
      select: { category: true },
      distinct: ["category"],
    });
    const validCats = distinctCats.map((c: any) => c.category).filter(Boolean);
    if (validCats.length > 0) {
      existingCategoriesStr = validCats.join(", ");
    }
  } catch (e) {
    console.warn("Failed to fetch distinct categories", e);
  }

  try {
    const prompt = `
    Analyze the following document and provide a JSON response with:
    - 'tags' (array of strings, max 5)
    - 'category' (string: STRONGLY PREFER choosing one of these existing categories: [${existingCategoriesStr}]. If it absolutely doesn't fit, create a new succinct 1-2 word category)
    - 'domain' (string)
    - 'status' (string: MUST BE EXACTLY "Draft", "Review", or "Published")
    - 'priority' (string: MUST BE EXACTLY "High", "Medium", or "Low")
    - 'type' (string: MUST BE EXACTLY "Note", "Article", "Snippet", "Idea", or "Task")
    
    Document Title: ${title}
    Document Content:
    ${content.substring(0, 1500)}...
    
    Return ONLY valid JSON.
    `;

    let aiResponseText = "";
    const useGemini = process.env.USE_GEMINI === "true";

    if (useGemini) {
      const userKey = await getUserApiKey();
      const apiKey =
        userKey ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
        process.env.GEMINI_API_KEY ||
        "";

      if (apiKey) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          },
        );
        if (res.ok) {
          const data = await res.json();
          aiResponseText =
            data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        } else {
          console.warn("Gemini REST API failed:", await res.text());
        }
      }
    } else {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const ollamaProvider = createOpenAI({
        baseURL: "http://127.0.0.1:11434/v1",
        apiKey: "ollama",
      });
      const ollamaModelName = process.env.OLLAMA_MODEL || "gemma4";
      const aiResponse = await generateText({
        model: ollamaProvider(ollamaModelName),
        prompt,
      });
      aiResponseText = aiResponse.text;
    }

    const startIndex = aiResponseText.indexOf("{");
    const endIndex = aiResponseText.lastIndexOf("}");
    if (startIndex !== -1 && endIndex !== -1) {
      const jsonStr = aiResponseText.substring(startIndex, endIndex + 1);
      const aiData = JSON.parse(jsonStr);

      if (Array.isArray(aiData.tags)) tags = aiData.tags;
      if (aiData.category) category = aiData.category;
      if (aiData.domain) domain = aiData.domain;
      if (aiData.status) status = aiData.status;
      if (aiData.priority) priority = aiData.priority;
      if (aiData.type) type = aiData.type;
    }
  } catch (aiError) {
    console.warn("AI Parsing failed", aiError);
  }

  return { tags, category, domain, status, priority, type };
}

// Compute embeddings
async function computeEmbedding(
  title: string,
  content: string,
): Promise<number[] | null> {
  try {
    const useGeminiForEmbed = process.env.USE_GEMINI === "true";
    if (useGeminiForEmbed) {
      const userKey = await getUserApiKey();
      const apiKey =
        userKey ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
        process.env.GEMINI_API_KEY ||
        "";
      if (apiKey) {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "models/text-embedding-004",
              content: {
                parts: [
                  { text: `Title: ${title}\n\n${content.substring(0, 4000)}` },
                ],
              },
            }),
          },
        );
        if (geminiRes.ok) {
          const data = await geminiRes.json();
          return data.embedding?.values || null;
        }
      }
    } else {
      const embedModel = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
      const embedRes = await fetch("http://localhost:11434/api/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: embedModel,
          prompt: `Title: ${title}\n\n${content.substring(0, 4000)}`,
        }),
      });
      if (embedRes.ok) {
        const data = await embedRes.json();
        return data.embedding || null;
      }
    }
  } catch (e) {
    console.warn("Embedding computation failed", e);
  }
  return null;
}

// Helper to write to Obsidian Vault if configured
async function saveToObsidian(
  title: string,
  content: string,
  category: string,
) {
  try {
    // Check if vault path is configured in .env, otherwise use fallback or skip
    // Since user requested it, let's use the hardcoded fallback for the user if not set
    const vaultPath =
      process.env.OBSIDIAN_VAULT_PATH || "C:\\Users\\ishib\\obsidian_vault";

    // Quick check if directory exists
    try {
      const stat = await fs.stat(vaultPath);
      if (!stat.isDirectory()) return false;
    } catch {
      return false; // Directory doesn't exist, silently skip
    }

    const inboxPath = path.join(vaultPath, "00_inbox");
    const categoryPath = path.join(
      inboxPath,
      category.replace(/[^a-zA-Z0-9_-]/g, "_"),
    );

    // Ensure category directory exists
    await fs.mkdir(categoryPath, { recursive: true });

    // Sanitize filename and strictly remove newlines/tabs
    const safeTitle =
      title.replace(/[\\/:*?"<>|\r\n\t]/g, "-").trim() || "Untitled";
    let targetFile = path.join(categoryPath, `${safeTitle}.md`);

    // Handle duplicates
    let counter = 1;
    while (true) {
      try {
        await fs.access(targetFile);
        targetFile = path.join(categoryPath, `${safeTitle}_${counter}.md`);
        counter++;
      } catch {
        break; // File does not exist, safe to write
      }
    }

    await fs.writeFile(targetFile, content, "utf-8");
    console.log(`Saved to Obsidian: ${targetFile}`);
    return true;
  } catch (error) {
    console.error("Failed to save to Obsidian vault:", error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Basic auth check
    const session = {
      user: { id: "local-user", name: "Local Admin", email: "admin@local" },
    };
    const user_id = session.user.id;

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const results = [];

    for (const file of files) {
      try {
        const originalName = file.name;
        const extension = path.extname(originalName).toLowerCase();

        // --- Markdownのみ許可 ---
        if (extension !== ".md") {
          console.log(`Skipped non-markdown file: ${originalName}`);
          results.push({
            title: originalName,
            status: "error",
            error: "Only Markdown (.md) files are supported",
          });
          continue;
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        let baseName = originalName.replace(extension, "");
        let content = buffer.toString("utf-8");

        if (!content.trim()) continue;

        // Clean up content: Remove null bytes (\x00) which cause PostgreSQL errors
        content = content.replace(/\0/g, "");
        // Make sure baseName has no newlines
        baseName = baseName.replace(/\r?\n|\r/g, "").trim() || "Untitled";

        // Run AI Categorization
        const meta = await categorizeAndTag(baseName, content, user_id);

        // Save to DB
        const doc = await prisma.knowledgeDocument.create({
          data: {
            title: baseName,
            content,
            user_id,
            ...meta,
          },
        });

        // Compute and store embeddings
        const embedding = await computeEmbedding(baseName, content);
        if (embedding && embedding.length > 0) {
          const vectorStr = `[${embedding.join(",")}]`;
          await prisma.$executeRawUnsafe(
            `UPDATE "KnowledgeDocument" SET embedding = $1::vector WHERE id = $2::uuid`,
            vectorStr,
            doc.id,
          );
        }

        // Save to Obsidian
        await saveToObsidian(baseName, content, meta.category);

        results.push({
          id: doc.id,
          title: baseName,
          category: meta.category,
          status: "success",
        });
      } catch (fileErr: any) {
        console.error(`Error processing file ${file.name}:`, fileErr);
        results.push({
          title: file.name,
          status: "error",
          error: fileErr.message,
        });
      }
    }

    return NextResponse.json({ results }, { status: 200 });
  } catch (error: any) {
    console.error("Import API Error:", error);
    return NextResponse.json(
      { error: "Failed to import documents" },
      { status: 500 },
    );
  }
}
