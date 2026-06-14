import { NextResponse } from "next/server";
import { google } from "googleapis";
import { Readable } from "stream";

export async function POST(request: Request) {
  try {
    const { title, content } = await request.json();

    if (!title || !content) {
      return NextResponse.json(
        { error: "Title and content are required" },
        { status: 400 },
      );
    }

    // Google Drive credentials from environment variables (strip quotes if they exist)
    const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL?.replace(
      /^"|"$/g,
      "",
    );
    let privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(
      /^"|"$/g,
      "",
    );
    privateKey = privateKey?.replace(/\\n/g, "\n");
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID; // Optional folder ID

    if (!clientEmail || !privateKey) {
      return NextResponse.json(
        {
          error:
            "Google Drive credentials are not configured on the server. Please set GOOGLE_DRIVE_CLIENT_EMAIL and GOOGLE_DRIVE_PRIVATE_KEY.",
        },
        { status: 500 },
      );
    }

    // Authenticate with Google Drive using a Service Account
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });

    const drive = google.drive({ version: "v3", auth });

    // File metadata (uploading as Google Doc or plain text)
    const fileMetadata: any = {
      name: `${title}.md`,
      // mimeType: 'application/vnd.google-apps.document', // uncomment to convert to Google Doc
    };

    if (folderId) {
      fileMetadata.parents = [folderId];
    }

    // Convert string to stream
    const media = {
      mimeType: "text/markdown",
      body: Readable.from(content),
    };

    // Upload to Drive
    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, webViewLink",
    });

    return NextResponse.json({
      success: true,
      fileId: file.data.id,
      url: file.data.webViewLink,
    });
  } catch (error: any) {
    console.error("Google Drive Export Error:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to export to Google Drive",
      },
      { status: 500 },
    );
  }
}
