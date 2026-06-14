import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

const apiKey =
  process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

async function run() {
  const model2 = genAI.getGenerativeModel({ model: "gemini-embedding-2" });
  const result2 = await model2.embedContent("Hello world");
  console.log("gemini-embedding-2 length:", result2.embedding.values.length);
}
run();
