"use server";

import { JSDOM } from "jsdom";
import { Defuddle } from "defuddle/node";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import fs from "fs/promises";

const execFileAsync = promisify(execFile);

export async function extractArticle(url: string) {
  try {
    // Validate URL
    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname.toLowerCase();

    // 1. YouTube (youtube-transcript-api 経由)
    if (domain.includes("youtube.com") || domain.includes("youtu.be")) {
      const videoId =
        parsedUrl.searchParams.get("v") || parsedUrl.pathname.slice(1);
      if (!videoId) throw new Error("Invalid YouTube URL");

      const currentDir = process.cwd();
      const isDev = currentDir.includes("katmer-defuddle");
      // xmcp に同梱されているvenvを使用 (youtube-transcript-api がインストール済みであると想定)
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

      const pyScript = `
import sys
import json
import urllib.request
import re

try:
    from youtube_transcript_api import YouTubeTranscriptApi
except ImportError:
    print(json.dumps({"error": "youtube_transcript_api not installed"}))
    sys.exit(0)

video_id = "${videoId}"
try:
    html = urllib.request.urlopen("https://www.youtube.com/watch?v=" + video_id).read().decode('utf-8')
    title_match = re.search(r'<title>(.*?)</title>', html)
    title = title_match.group(1).replace(" - YouTube", "") if title_match else "YouTube Video"

    t_list = YouTubeTranscriptApi().list(video_id)
    try:
        res = t_list.find_transcript(['ja', 'en']).fetch()
    except Exception:
        # フォールバック: とにかく最初に見つかった字幕を取得
        res = [t for t in t_list][0].fetch()

    text = " ".join([t.text if hasattr(t, 'text') else t['text'] for t in res])
    
    content = f"### {title}\\n\\n**Video ID:** {video_id}\\n**URL:** https://www.youtube.com/watch?v={video_id}\\n\\n---\\n\\n{text}"
    print(json.dumps({"title": title, "content": content}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
`;
      const tmpScriptPath = path.join(os.tmpdir(), `yt_${Date.now()}.py`);
      await fs.writeFile(tmpScriptPath, pyScript);

      const { stdout } = await execFileAsync(venvPythonPath, [tmpScriptPath]);
      await fs.unlink(tmpScriptPath).catch(console.error);

      if (stdout) {
        try {
          const res = JSON.parse(stdout);
          if (res.error) throw new Error(res.error);
          return {
            success: true,
            data: {
              title: res.title,
              content: res.content,
              author: "YouTube",
              site: "YouTube",
            },
          };
        } catch (e) {
          console.error("Failed to parse python output:", stdout);
        }
      }
      throw new Error("Failed to extract YouTube transcript");
    }

    // 2. X (Twitter) (xurl 経由)
    if (domain.includes("x.com") || domain.includes("twitter.com")) {
      const parts = parsedUrl.pathname.split("/");
      const statusIdx = parts.indexOf("status");

      if (statusIdx !== -1 && parts[statusIdx + 1]) {
        const postId = parts[statusIdx + 1];
        try {
          const currentDir = process.cwd();
          // Assuming xurl is built and available at this path:
          const xurlPathBase = path.join(
            currentDir,
            "..",
            "x-tools",
            "xurl",
            "xurl",
          );
          const binPath =
            os.platform() === "win32" ? `${xurlPathBase}.exe` : xurlPathBase;

          const { stdout } = await execFileAsync(binPath, ["read", postId]);
          const content = `### X (Twitter) Post\n\n**URL:** ${url}\n\n---\n\n${stdout}`;

          return {
            success: true,
            data: {
              title: `X Post: ${postId}`,
              content: content,
              author: parts[statusIdx - 1] || "X User",
              site: "X (Twitter)",
            },
          };
        } catch (e: any) {
          console.error("xurl execution failed:", e);
          throw new Error(
            "X (Twitter) extraction requires 'xurl' tool to be built and authenticated. Error: " +
              e.message,
          );
        }
      }
    }

    // 3. 一般的なWebサイト (Defuddle / JSDOM)
    const dom = await JSDOM.fromURL(url);
    const result = await Defuddle(dom, url, {
      markdown: true,
      debug: false,
    });

    return {
      success: true,
      data: {
        title: result.title,
        content: result.content, // with markdown: true, content should be markdown
        author: result.author,
        site: result.site,
      },
    };
  } catch (error: any) {
    console.error("Extraction error:", error);

    // 4. フォールバック: markitdown を試す
    try {
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

      const { stdout } = await execFileAsync(venvPythonPath, [
        "-m",
        "markitdown",
        url,
      ]);
      if (stdout && stdout.trim().length > 0) {
        return {
          success: true,
          data: {
            title: `Extracted from: ${url}`,
            content: stdout,
            author: "Markitdown",
            site: "Unknown",
          },
        };
      }
    } catch (fallbackError) {
      console.error("Markitdown fallback error:", fallbackError);
    }

    return {
      success: false,
      error: error.message || "Failed to extract content from the URL",
    };
  }
}

export async function saveToRawDirectory(title: string, content: string) {
  try {
    const currentDir = process.cwd();
    // Assuming next.js runs inside `knowledge-base`, the root is one level up
    const rootDir = currentDir.includes("knowledge-base")
      ? path.join(currentDir, "..")
      : currentDir;
    const rawDir = path.join(rootDir, "llm-wiki", "raw");

    // Ensure the directory exists
    await fs.mkdir(rawDir, { recursive: true });

    const safeTitle = (title || `Extract_${Date.now()}`)
      .replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/gi, "_")
      .toLowerCase();
    const fileName = `${safeTitle}_${Date.now()}.md`;
    const filePath = path.join(rawDir, fileName);

    await fs.writeFile(filePath, content, "utf-8");

    return { success: true, path: filePath };
  } catch (error: any) {
    console.error("Failed to save to raw directory:", error);
    return { success: false, error: error.message };
  }
}
