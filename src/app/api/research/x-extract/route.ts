import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";

export const runtime = "nodejs"; // Use Node.js runtime for child_process
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const scrolls = req.nextUrl.searchParams.get("scrolls") || "10";

  if (!url) {
    return new Response("Missing URL parameter", { status: 400 });
  }

  // Set up Server-Sent Events headers
  const headers = new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const stream = new ReadableStream({
    start(controller) {
      const scriptPath = path.resolve(
        process.cwd(),
        "scripts/python_tools/extract_x_data.py",
      );

      const encoder = new TextEncoder();

      const sendEvent = (type: string, data: string) => {
        const message = `event: ${type}\ndata: ${JSON.stringify({ message: data })}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      sendEvent("info", `Initializing data extraction for: ${url}`);

      // We use 'python' assuming it's available in the PATH, or might need to use 'py' on Windows
      const pythonProcess = spawn("python", [
        scriptPath,
        "--url",
        url,
        "--scrolls",
        scrolls,
      ]);

      pythonProcess.stdout.on("data", (data) => {
        const lines = data.toString().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            let type = "info";
            if (line.includes("[ERROR]")) type = "error";
            if (line.includes("[SUCCESS]")) type = "success";
            if (line.includes("[PROGRESS]")) type = "progress";
            sendEvent(type, line.trim());
          }
        }
      });

      pythonProcess.stderr.on("data", (data) => {
        const lines = data.toString().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            sendEvent("error", line.trim());
          }
        }
      });

      pythonProcess.on("close", (code) => {
        sendEvent("done", `Process exited with code ${code}`);
        controller.close();
      });

      pythonProcess.on("error", (err) => {
        sendEvent("error", `Failed to start subprocess: ${err.message}`);
        controller.close();
      });

      // Handle client disconnect
      req.signal.addEventListener("abort", () => {
        if (!pythonProcess.killed) {
          pythonProcess.kill();
        }
        controller.close();
      });
    },
  });

  return new Response(stream, { headers });
}
