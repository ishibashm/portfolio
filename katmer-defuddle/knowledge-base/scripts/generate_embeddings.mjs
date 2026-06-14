import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

const prisma = new PrismaClient();

const apiKey =
  process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("No Google API key found in .env");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "models/gemini-embedding-2" });

async function generateEmbeddings() {
  try {
    const docIds = await prisma.$queryRaw`
      SELECT id FROM "KnowledgeDocument" WHERE embedding IS NULL;
    `;

    console.log(`Found ${docIds.length} documents without embeddings.`);

    for (let i = 0; i < docIds.length; i++) {
      const { id } = docIds[i];
      const doc = await prisma.knowledgeDocument.findUnique({
        where: { id },
        select: { id: true, title: true, content: true },
      });

      if (!doc || !doc.content) continue;
      const textToEmbed = `Title: ${doc.title}\n\nContent: ${doc.content}`;

      try {
        const result = await model.embedContent({
          content: { parts: [{ text: textToEmbed }] },
          outputDimensionality: 768,
        });
        const embedding = result.embedding.values;

        const vectorLiteral = `[${embedding.join(",")}]`;

        await prisma.$executeRaw`
          UPDATE "KnowledgeDocument" 
          SET embedding = ${vectorLiteral}::vector
          WHERE id = ${doc.id}::uuid;
        `;

        console.log(
          `[${i + 1}/${docIds.length}] Generated embedding for: ${doc.title}`,
        );

        // Free tier rate limit is 15 RPM (1 request per 4 seconds)
        await new Promise((resolve) => setTimeout(resolve, 4500));
      } catch (err) {
        console.error(
          `Error processing document ${doc.id} (${doc.title}):`,
          err.message,
        );
        // Wait a bit longer on error to backoff
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    }

    console.log("Finished generating embeddings!");
  } catch (error) {
    console.error("Error connecting to database:", error);
  } finally {
    await prisma.$disconnect();
  }
}

generateEmbeddings();
