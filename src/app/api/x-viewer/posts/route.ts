import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import fs from "fs";
import path from "path";
import readline from "readline";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const handle = searchParams.get("handle");

  if (!handle) {
    return NextResponse.json({ error: "Handle is required" }, { status: 400 });
  }

  const postMap = new Map<string, any>();

  // 1. Get from database
  try {
    const whereClause = handle === "ALL" ? {} : { authorHandle: handle };
    const dbPosts = await prisma.xPost.findMany({
      where: whereClause,
      take: 1000, // Limit to prevent overwhelming the client
    });

    dbPosts.forEach((post) => {
      postMap.set(post.id, {
        id: post.id,
        url: post.url,
        author_handle: post.authorHandle,
        author_display: post.authorDisplay,
        datetime: post.datetime.toISOString(),
        text: post.text,
        quoted_urls: post.quotedUrls,
        external_links: post.externalLinks,
        saved_media: post.savedMedia,
      });
    });
  } catch (error) {
    console.warn(
      `Database connection failed, continuing with local files:`,
      error,
    );
  }

  // 2. Get from local files
  try {
    const downloadsDir = path.join(process.cwd(), "x_downloads");

    if (fs.existsSync(downloadsDir)) {
      let filesToRead: string[] = [];

      if (handle === "ALL") {
        const allFiles = fs.readdirSync(downloadsDir);
        filesToRead = allFiles.filter((f) => f.match(/^x_(.+)_data\.jsonl$/));
      } else {
        const filePath = path.join(downloadsDir, `x_${handle}_data.jsonl`);
        if (fs.existsSync(filePath)) {
          filesToRead = [`x_${handle}_data.jsonl`];
        }
      }

      for (const fileName of filesToRead) {
        const filePath = path.join(downloadsDir, fileName);
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({
          input: fileStream,
          crlfDelay: Infinity,
        });

        for await (const line of rl) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (!postMap.has(data.id)) {
              postMap.set(data.id, {
                id: data.id,
                url: data.url || "",
                author_handle: data.author_handle || "",
                author_display: data.author_display || "",
                datetime: data.datetime || new Date().toISOString(),
                text: data.text || "",
                quoted_urls: data.quoted_urls || [],
                external_links: data.external_links || [],
                saved_media: data.saved_media || [],
              });
            }
          } catch (e) {
            console.error(`Error parsing line in local file ${filePath}:`, e);
          }
        }
      }
    }
  } catch (fsError) {
    console.error(`Error reading local posts:`, fsError);
  }

  const allPosts = Array.from(postMap.values());
  // Sort by datetime desc
  allPosts.sort(
    (a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime(),
  );

  // Truncate if too many for performance
  const limitedPosts = handle === "ALL" ? allPosts.slice(0, 1000) : allPosts;

  return NextResponse.json({ posts: limitedPosts });
}
