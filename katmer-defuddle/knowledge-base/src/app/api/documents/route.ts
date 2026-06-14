import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateText } from "ai";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import { getUserApiKey } from "@/app/settings/actions";

export async function GET(request: NextRequest) {
  try {
    const session = {
      user: { id: "local-user", name: "Local Admin", email: "admin@local" },
    }; // const session = await getServerSession(authOptions);
    if (false) {
      // if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const documents = await prisma.knowledgeDocument.findMany({
      where: { user_id: session.user.id },
      orderBy: { created_at: "desc" },
    });
    return NextResponse.json(documents);
  } catch (error: any) {
    console.error("Error fetching documents:", error);
    return NextResponse.json(
      {
        error:
          "Failed to fetch documents: " + (error.message || "Unknown DB Error"),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = {
      user: { id: "local-user", name: "Local Admin", email: "admin@local" },
    }; // const session = await getServerSession(authOptions);
    if (false) {
      // if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { title, content } = await request.json();
    const user_id = session.user.id as string;

    if (!title || !content || !user_id) {
      return NextResponse.json(
        { error: "Missing required fields (title, content)" },
        { status: 400 },
      );
    }

    // Auto-generate tags, category and structured fields using AI
    let tags: string[] = [];
    let category = "Uncategorized";
    let domain = "General";
    let status = "Draft";
    let priority = "Medium";
    let type = "Note";

    const disableAutoTagging = process.env.DISABLE_AI_AUTO_TAGGING === "true";

    if (!disableAutoTagging) {
      // Fetch existing categories from DB dynamically
      let existingCategoriesStr = "None";
      try {
        const distinctCats = await prisma.knowledgeDocument.findMany({
          where: { user_id: user_id, category: { not: null } },
          select: { category: true },
          distinct: ["category"],
        });
        const validCats = distinctCats.map((c) => c.category).filter(Boolean);
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
        - 'category' (string: STRONGLY PREFER choosing one of these existing categories: [${existingCategoriesStr}]. If and only if it absolutely does not fit any of these, create a new succinct 1-2 word category)
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
          const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
          const google = createGoogleGenerativeAI({
            apiKey:
              userKey ||
              process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
              process.env.GEMINI_API_KEY ||
              "",
          });
          // Cost optimization: Use Flash-Lite for simple tagging tasks instead of Pro
          const aiResponse = await generateText({
            model: google("gemini-2.5-flash") as any,
            prompt,
          });
          aiResponseText = aiResponse.text;
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
        } else {
          console.warn("Could not find JSON in AI response:", aiResponseText);
        }
      } catch (aiError) {
        console.warn(
          "AI Parsing failed, falling back to empty labels",
          aiError,
        );
      }
    }

    const doc = await prisma.knowledgeDocument.create({
      data: {
        title,
        content,
        user_id,
        tags,
        category,
        domain,
        status,
        priority,
        type,
      },
    });

    // Compute embedding for vector search
    try {
      const useGeminiForEmbed = process.env.USE_GEMINI === "true";
      let embedding: number[] | null = null;

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
                    {
                      text: `Title: ${title}\n\n${content.substring(0, 4000)}`,
                    },
                  ],
                },
              }),
            },
          );
          if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            embedding = geminiData.embedding?.values;
          } else {
            console.warn("Failed to compute embedding via Gemini API");
          }
        }
      } else {
        // Assuming nomic-embed-text for local Ollama embeddings
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
          const embedData = await embedRes.json();
          embedding = embedData.embedding;
        } else {
          console.warn("Failed to compute embedding via Ollama API");
        }
      }

      if (Array.isArray(embedding) && embedding.length > 0) {
        // Format correctly for pgvector: '[0.1, 0.2, ...]'
        const vectorStr = `[${embedding.join(",")}]`;
        await prisma.$executeRawUnsafe(
          `UPDATE "KnowledgeDocument" SET embedding = $1::vector WHERE id = $2::uuid`,
          vectorStr,
          doc.id,
        );
      }
    } catch (embedError) {
      console.warn(
        "Embedding computation failed, storing without vector",
        embedError,
      );
    }

    return NextResponse.json(doc, { status: 201 });
  } catch (error: any) {
    console.error("Error creating document:", error);
    return NextResponse.json(
      {
        error:
          "Failed to create document: " + (error.message || "Unknown DB Error"),
      },
      { status: 500 },
    );
  }
}
