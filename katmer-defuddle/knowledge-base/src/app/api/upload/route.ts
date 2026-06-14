import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import os from "os";
import { getUserApiKey } from "@/app/settings/actions";
import { convert } from "@opendataloader/pdf";

// Ensure Java is in PATH
if (!process.env.PATH?.includes("jdk-21.0.11.10-hotspot")) {
  process.env.PATH = `C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.11.10-hotspot\\bin;${process.env.PATH}`;
}

const execFileAsync = promisify(execFile);

// Helper to generate a Japanese title using local Ollama or Gemini
async function generateJapaneseTitle(
  content: string,
  originalTitle: string,
): Promise<string> {
  try {
    const useGemini = process.env.USE_GEMINI === "true";
    const prompt = `以下のドキュメントの内容から、最も適切で簡潔な日本語のタイトル（30文字以内）を一つだけ作成してください。余計な説明や「〜について」などの装飾は不要です。直接タイトルのみ出力してください。\n\n${content.substring(0, 2000)}`;

    if (useGemini) {
      const userKey = await getUserApiKey();
      const apiKey =
        userKey ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
        process.env.GEMINI_API_KEY;
      if (!apiKey) return originalTitle;

      // Cost optimization: Use Flash-Lite for simple title generation instead of Pro
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
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text.trim().replace(/^["']|["']$/g, "");
      }
    } else {
      // Default to local Ollama
      const ollamaModelName = process.env.OLLAMA_MODEL || "gemma4"; // match chat route default or phi4
      const res = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModelName,
          prompt: prompt,
          stream: false,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.response.trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch (e) {
    console.error("Title generation failed:", e);
  }
  return originalTitle;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const originalName = file.name;
    const extension = path.extname(originalName).toLowerCase();
    const baseName = originalName.replace(extension, "");

    // If it's already markdown or txt, just return the text
    if (
      extension === ".md" ||
      extension === ".txt" ||
      file.type.startsWith("text/")
    ) {
      const content = buffer.toString("utf-8");
      const title = await generateJapaneseTitle(content, baseName);
      return NextResponse.json({ title, content });
    }

    // Otherwise, temporarily save it and convert it using markitdown
    const tmpdir = os.tmpdir();
    const tmpId = crypto.randomUUID();
    const tmpFilePath = path.join(tmpdir, `${tmpId}${extension}`);

    await fs.writeFile(tmpFilePath, buffer);

    try {
      let stdout = "";

      if (extension === ".pdf") {
        try {
          // Use @opendataloader/pdf for PDFs which supports OCR natively via Java
          stdout = await convert(tmpFilePath, {
            format: "markdown",
            toStdout: true,
            quiet: true,
          });
        } catch (pdfErr: any) {
          console.warn(
            "OpenDataLoader PDF failed, falling back to markitdown:",
            pdfErr.message,
          );
        }
      }

      if (!stdout) {
        // Use the python venv from x-tools/xmcp which has markitdown installed
        const currentDir = process.cwd();
        const isDev = currentDir.includes("katmer-defuddle");
        const venvPythonPath = isDev
          ? path.join(
              currentDir,
              "..",
              "x-tools",
              "xmcp",
              "venv",
              "Scripts",
              "python.exe",
            )
          : "/opt/venv/bin/python";

        try {
          // Execute markitdown via venv with increased buffer (50MB)
          const result = await execFileAsync(
            venvPythonPath,
            ["-m", "markitdown", tmpFilePath],
            { maxBuffer: 50 * 1024 * 1024 },
          );
          stdout = result.stdout;
        } catch (fallbackErr: any) {
          console.warn("Venv Python fallback failed:", fallbackErr.message);
          try {
            const result = await execFileAsync(
              "npx",
              ["--yes", "markitdown", tmpFilePath],
              { maxBuffer: 50 * 1024 * 1024 },
            );
            stdout = result.stdout;
          } catch (npxErr: any) {
            console.warn("Global npx fallback failed:", npxErr.message);
            try {
              const result = await execFileAsync(
                "python",
                ["-m", "markitdown", tmpFilePath],
                { maxBuffer: 50 * 1024 * 1024 },
              );
              stdout = result.stdout;
            } catch (pyErr: any) {
              console.warn("Global python markitdown failed:", pyErr.message);
              throw new Error(
                `MarkItDown extraction failed. venv: ${fallbackErr.message.substring(0, 100)}`,
              );
            }
          }
        }
      }

      // Cleanup
      await fs.unlink(tmpFilePath).catch(() => {});

      if (!stdout || stdout.trim() === "") {
        throw new Error(
          "No text could be extracted from this document. It might be an image-only PDF without OCR.",
        );
      }

      const title = await generateJapaneseTitle(stdout, baseName);

      return NextResponse.json({ title, content: stdout });
    } catch (e: any) {
      // Cleanup
      await fs.unlink(tmpFilePath).catch(() => {});
      console.error("Python conversion failed:", e);
      return NextResponse.json(
        { error: "Failed to parse document: " + e.message },
        { status: 500 },
      );
    }
  } catch (err: any) {
    console.error("Upload Error:", err);
    return NextResponse.json({ error: "File upload error" }, { status: 500 });
  }
}
