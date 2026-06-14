import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

const apiKey =
  process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

async function testModel(modelName) {
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.embedContent("Hello world");
    console.log(
      `${modelName} output dimension:`,
      result.embedding.values.length,
    );
  } catch (err) {
    console.error(`${modelName} error:`, err.message);
  }
}

async function run() {
  await testModel("text-embedding-004");
  await testModel("models/text-embedding-004");
  await testModel("gemini-embedding-001");
  await testModel("models/embedding-001");
}
run();
