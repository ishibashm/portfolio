"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { generateText } from "ai";
import { getUserApiKey } from "../settings/actions";

export async function updateDocumentContent(id: string, formData: FormData) {
  const session = {
    user: { id: "local-user", name: "Local Admin", email: "admin@local" },
  }; // const session = await getServerSession(authOptions);

  if (false) {
    // if (!session || !session.user) {
    throw new Error("Unauthorized");
  }

  const content = formData.get("content") as string;

  if (!id || typeof content !== "string") {
    throw new Error("Invalid input");
  }

  // Ensure user owns the document
  const doc = await prisma.knowledgeDocument.findUnique({
    where: { id },
  });

  if (!doc || doc.user_id !== session.user.id) {
    throw new Error("Unauthorized or document not found");
  }

  await prisma.knowledgeDocument.update({
    where: { id },
    data: {
      content,
      updated_at: new Date(),
    },
  });

  revalidatePath(`/${id}`);
  revalidatePath(`/`);
  redirect(`/${id}?view=standard`);
}

export async function categorizeDocument(id: string) {
  const session = {
    user: { id: "local-user", name: "Local Admin", email: "admin@local" },
  }; // const session = await getServerSession(authOptions);

  if (false) {
    // if (!session || !session.user) {
    throw new Error("Unauthorized");
  }

  const doc = await prisma.knowledgeDocument.findUnique({
    where: { id },
  });

  if (!doc || doc.user_id !== session.user.id) {
    throw new Error("Unauthorized or document not found");
  }

  // Fetch existing categories from DB dynamically
  let existingCategoriesStr = "None";
  try {
    const distinctCats = await prisma.knowledgeDocument.findMany({
      where: { user_id: session.user.id, category: { not: null } },
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
    
    Document Title: ${doc.title}
    Document Content:
    ${doc.content.substring(0, 1500)}...
    
    Return ONLY valid JSON. Do not include markdown code blocks like \`\`\`json.
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

    let cleanText = aiResponseText
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const startIndex = cleanText.indexOf("{");
    const endIndex = cleanText.lastIndexOf("}");
    if (startIndex !== -1 && endIndex !== -1) {
      const jsonStr = cleanText.substring(startIndex, endIndex + 1);
      const aiData = JSON.parse(jsonStr);

      await prisma.knowledgeDocument.update({
        where: { id },
        data: {
          tags: Array.isArray(aiData.tags) ? aiData.tags : undefined,
          category: aiData.category || undefined,
          domain: aiData.domain || undefined,
          status: aiData.status || undefined,
          priority: aiData.priority || undefined,
          type: aiData.type || undefined,
          updated_at: new Date(),
        },
      });
    } else {
      throw new Error("Could not find JSON in AI response");
    }
  } catch (error) {
    console.error("Categorization failed:", error);
    throw new Error("Categorization failed");
  }

  revalidatePath(`/${id}`);
  revalidatePath(`/`);
}
