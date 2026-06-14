// @ts-nocheck
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { generateText, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

// Load environment variables
dotenv.config();

const WIKI_DIR = path.resolve(process.cwd(), "../llm-wiki");
const RAW_DIR = path.join(WIKI_DIR, "raw");
const WIKI_PAGES_DIR = path.join(WIKI_DIR, "wiki");
const INDEX_FILE = path.join(WIKI_DIR, "index.md");
const LOG_FILE = path.join(WIKI_DIR, "log.md");
const SCHEMA_FILE = path.join(WIKI_DIR, "SCHEMA.md");

// Ensure directories exist
if (!fs.existsSync(WIKI_PAGES_DIR))
  fs.mkdirSync(WIKI_PAGES_DIR, { recursive: true });
if (!fs.existsSync(INDEX_FILE))
  fs.writeFileSync(INDEX_FILE, "# Catalog & Index\n\n");
if (!fs.existsSync(LOG_FILE))
  fs.writeFileSync(LOG_FILE, "# Operations Log\n\n## Logs\n");

// Read current log to track processed files
const currentLog = fs.existsSync(LOG_FILE)
  ? fs.readFileSync(LOG_FILE, "utf-8")
  : "";

// Identify up to N unprocessed files
function getUnprocessedFiles(limit = 5) {
  const rawFiles = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith(".md"));
  const unprocessed = [];

  for (const file of rawFiles) {
    // If the filename sequence is not in the log.md, it's considered un-processed
    if (!currentLog.includes(file)) {
      unprocessed.push(file);
    }
    if (unprocessed.length >= limit) break;
  }
  return unprocessed;
}

async function runLibrarian() {
  const filesToProcess = getUnprocessedFiles(3); // 3件ずつバッチ処理
  if (filesToProcess.length === 0) {
    console.log("No new raw files to process.");
    return;
  }

  console.log(
    `Found ${filesToProcess.length} new raw files. Starting Librarian Agent...`,
  );

  const schemaContent = fs.existsSync(SCHEMA_FILE)
    ? fs.readFileSync(SCHEMA_FILE, "utf-8")
    : "No SCHEMA found. Just summarize.";

  // Read all selected file contents
  let contextText = "Here are the un-processed files you need to ingest:\n\n";
  for (const file of filesToProcess) {
    const content = fs.readFileSync(path.join(RAW_DIR, file), "utf-8");
    contextText += `--- START OF RAW FILE: ${file} ---\n${content}\n--- END OF RAW FILE: ${file} ---\n\n`;
  }

  // Use Local Ollama (Gemma4) or Gemini based on USE_GEMINI flag
  const useGemini = process.env.USE_GEMINI === "true";
  let aiModel;

  if (useGemini) {
    const geminiProvider = createOpenAI({
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      apiKey:
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
        "dummy",
    });
    aiModel = geminiProvider("gemini-2.5-flash");
    console.log(
      `Connecting to Gemini API via compatibility layer. Processing may take a moment...`,
    );
  } else {
    const ollamaProvider = createOpenAI({
      baseURL: "http://127.0.0.1:11434/v1",
      apiKey: "ollama",
    });
    aiModel = ollamaProvider(process.env.OLLAMA_MODEL || "gemma4:latest");
    console.log(
      `Connecting to Local Ollama (Gemma4). Processing may take a moment...`,
    );
  }

  try {
    const result = await generateText({
      model: aiModel,
      system: `You are the autonomous Katmer Base Librarian Agent. Your job is to process new files from the 'raw/' folder and organize them into the 'wiki/'.\n\nSCHEMA GUIDELINES:\n${schemaContent}\n\nStrict Rules:\n1. You MUST use 'writeWikiFile' to save your synthesized articles into 'wiki/'. Synthesize content meaningfully. Group related information. \n2. You MUST use 'appendToIndex' to add a 1-line link to your new wiki articles.\n3. You MUST use 'appendToLog' for EVERY raw file you process, mentioning the raw filename exactly (e.g. "Ingested raw/0001_skills.md"), to prevent it from being processed again.\n4. Call tools concurrently when possible. DO NOT output raw markdown in regular text, ALWAYS use the 'writeWikiFile' tool.`,
      prompt: contextText,
      maxSteps: 5,
      tools: {
        writeWikiFile: tool({
          description:
            "Create or update a markdown file in the wiki/ directory.",
          parameters: z.object({
            filename: z
              .string()
              .describe(
                "The name of the file to create or update (e.g. topic_name.md). Do not include paths like wiki/.",
              ),
            content: z
              .string()
              .describe("The full markdown content to write to the file"),
          }),
          execute: async ({ filename, content }) => {
            const destPath = path.join(WIKI_PAGES_DIR, filename);
            let finalContent = content;
            if (fs.existsSync(destPath)) {
              finalContent =
                fs.readFileSync(destPath, "utf-8") + "\n\n" + content;
            }
            fs.writeFileSync(destPath, finalContent);
            console.log(`✅ writeWikiFile: Saved ${filename}`);
            return `Success writing to ${filename}`;
          },
        }),
        appendToIndex: tool({
          description: "Append a topic link to the index.md file.",
          parameters: z.object({
            entry: z
              .string()
              .describe(
                'The markdown list item to append (e.g. "- [Topic Name](wiki/topic_name.md): A brief summary")',
              ),
          }),
          execute: async ({ entry }) => {
            fs.appendFileSync(INDEX_FILE, `\n${entry}`);
            console.log(`✅ appendToIndex: Added entry`);
            return `Success updating index.md`;
          },
        }),
        appendToLog: tool({
          description:
            "Append chronological log to log.md. VERY IMPORTANT: You must mention the exact raw filename you processed.",
          parameters: z.object({
            logMessage: z
              .string()
              .describe(
                'The log string (e.g. "* [2026-04-19] Ingested raw/KB123.md and created wiki/topic.md")',
              ),
          }),
          execute: async ({ logMessage }) => {
            const dateStr = new Date().toISOString().split("T")[0];
            fs.appendFileSync(LOG_FILE, `\n* [${dateStr}] ${logMessage}`);
            console.log(`✅ appendToLog: Logged action`);
            return `Success updating log.md`;
          },
        }),
      },
    });

    console.log("\nLibrarian Agent finished its run safely.");
    console.log("Tool calls completed.");
  } catch (err: any) {
    console.error("\n[Error in Auto-Librarian]:", err.message);
  }
}

runLibrarian();
