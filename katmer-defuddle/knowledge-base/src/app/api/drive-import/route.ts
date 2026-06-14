import { NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { parseAiStudioJson } from "@/lib/parsers/ai-studio";

// Note: To keep things DRY, ideally these would be extracted to a shared service.
// But for simplicity in this route, we'll re-implement the core logic or just fetch and then
// use the same DB insertion logic. Since the previous route relies on NextRequest FormData,
// we will just do a simplified version here, or call a shared service if we had one.
// Let's implement the fetching logic here.

export async function POST(request: Request) {
  try {
    const { folderId } = await request.json();

    if (!folderId) {
      return NextResponse.json(
        { error: "folderId is required" },
        { status: 400 },
      );
    }

    // Google Drive credentials from environment variables
    const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL?.replace(
      /^["']|["']$/g,
      "",
    )?.trim();
    let privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY || "";

    // Safely unescape the private key
    // 1. Remove surrounding quotes if they exist
    privateKey = privateKey.replace(/^["']|["']$/g, "").trim();
    // 2. Replace escaped newlines with actual newlines
    privateKey = privateKey.replace(/\\n/g, "\n");
    // 3. Ensure the key has proper PEM formatting if it got mangled
    if (!privateKey.includes("\n")) {
      privateKey = privateKey.replace(
        /(-----BEGIN PRIVATE KEY-----)(.*)(-----END PRIVATE KEY-----)/,
        "$1\n$2\n$3",
      );
    }

    if (!clientEmail || !privateKey) {
      console.error("Google Drive Credentials missing");
      return NextResponse.json(
        {
          error:
            "Google Drive credentials are not configured on the server. Please set GOOGLE_DRIVE_CLIENT_EMAIL and GOOGLE_DRIVE_PRIVATE_KEY.",
        },
        { status: 500 },
      );
    }

    console.log(`Authenticating with Google Drive as: ${clientEmail}`);

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });

    const drive = google.drive({ version: "v3", auth });

    // List all files in the folder (ignore mimeType restrictions to catch extensionless JSONs)
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(id, name, mimeType)",
      spaces: "drive",
      pageSize: 1000,
    });

    const files = res.data.files;
    if (!files || files.length === 0) {
      return NextResponse.json({
        message: "No suitable files found in the folder",
        results: [],
      });
    }

    const results = [];
    const session = { user: { id: "local-user" } }; // Mock session

    for (const file of files) {
      try {
        const fileId = file.id!;
        const originalName = file.name || "";
        const mimeType = file.mimeType || "";
        let content = "";

        // --- MarkdownおよびGoogle Docsのみフェッチを許可する ---
        if (
          mimeType.startsWith("image/") ||
          mimeType.startsWith("video/") ||
          mimeType.startsWith("audio/")
        ) {
          console.log(`Skipped media file: ${originalName}`);
          continue;
        }

        const lowerName = originalName.toLowerCase();
        const isGoogleDoc = mimeType === "application/vnd.google-apps.document";
        const isMarkdown =
          lowerName.endsWith(".md") || mimeType === "text/markdown";
        const isExtensionless = !originalName.includes(".");
        const isJson =
          lowerName.endsWith(".json") || mimeType === "application/json";

        // Markdown、Google Docs、拡張子なしファイル、または JSON を許可する
        if (!isGoogleDoc && !isMarkdown && !isExtensionless && !isJson) {
          console.log(`Skipped non-markdown file: ${originalName}`);
          continue;
        }

        if (isGoogleDoc) {
          // Google Docs cannot be downloaded directly via media alt; they must be exported.
          const response = await drive.files.export(
            { fileId, mimeType: "text/plain" },
            { responseType: "stream" },
          );

          await new Promise((resolve, reject) => {
            response.data
              .on("data", (chunk: any) => {
                content += chunk;
              })
              .on("end", () => resolve(content))
              .on("error", (err: any) => reject(err));
          });
        } else if (file.mimeType !== "application/vnd.google-apps.folder") {
          // Normal files (JSON, Markdown, Text, or extensionless files)
          // Skip folders
          const response = await drive.files.get(
            { fileId, alt: "media" },
            { responseType: "stream" },
          );

          await new Promise((resolve, reject) => {
            response.data
              .on("data", (chunk: any) => {
                content += chunk;
              })
              .on("end", () => resolve(content))
              .on("error", (err: any) => reject(err));
          });
        }

        // Only process files that have actual text/content
        if (!content || typeof content !== "string") continue;

        let parsedContent = content;
        const extension = file.name?.split(".").pop()?.toLowerCase();
        const hasNoExtension = !file.name?.includes(".");
        let isSuccessfullyParsedAiStudio = false;

        // Attempt to parse if it's JSON or looks like JSON
        if (
          extension === "json" ||
          file.mimeType === "application/json" ||
          (hasNoExtension && content.trim().startsWith("{"))
        ) {
          const tryParsed = parseAiStudioJson(content);
          if (
            !tryParsed.startsWith("Error parsing JSON") &&
            !tryParsed.startsWith("Unrecognized JSON structure")
          ) {
            parsedContent = tryParsed;
            isSuccessfullyParsedAiStudio = true;
          }
        }

        // If it's a JSON or extensionless file, but we couldn't parse it as AI Studio chat, skip it
        if (
          (hasNoExtension || extension === "json") &&
          !isSuccessfullyParsedAiStudio
        ) {
          console.log(
            `Skipped non-AI-Studio json/extensionless file: ${originalName}`,
          );
          continue;
        }

        results.push({
          id: fileId,
          name: file.name,
          content: parsedContent,
          status: "fetched",
        });
      } catch (err: any) {
        console.error(`Failed to fetch file ${file.name}:`, err);
        results.push({ name: file.name, status: "error", error: err.message });
      }
    }

    // Instead of doing the full AI categorization in this route (which takes a long time for many files),
    // we return the fetched contents to the client. The client can then iterate over them and
    // POST them to /api/documents (existing API) or to /api/documents/import as files.
    // Wait, the requirement says "インポート用APIを作成する".
    // Returning them to the client is a good pattern for progress indication.

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error("Google Drive Import Error:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to import from Google Drive",
      },
      { status: 500 },
    );
  }
}
