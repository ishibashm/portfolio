import { streamText } from "ai";
import { convertToModelMessages } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

async function test() {
  const ollamaProvider = createOpenAI({
    baseURL: "http://localhost:11434/v1",
    apiKey: "ollama",
  });
  const ollamaModelName = "qwen2.5:14b-instruct";

  try {
    const result = await streamText({
      model: ollamaProvider(ollamaModelName),
      messages: [{ role: "user", content: "hello" }],
    });
    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
    }
  } catch (error) {
    console.error("SDK Error caught:", error);
  }
}

test();
