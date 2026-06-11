import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

export async function POST(req: NextRequest) {
  const { url } = await req.json();

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
  }

  let browser = null;
  try {
    // Use local chrome on Windows dev, serverless chromium in production
    const executablePath =
      process.env.NODE_ENV === "production"
        ? await chromium.executablePath()
        : process.env.CHROME_EXECUTABLE_PATH ||
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
      executablePath,
      headless: true,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });

    const screenshotBuffer = await page.screenshot({
      type: "png",
      fullPage: true,
    });

    await browser.close();

    // Pass the buffer properly so it does not get corrupted
    // We can use a Blob or raw Buffer. Buffer.from ensures clean binary data.
    const imageBuffer = Buffer.from(screenshotBuffer);

    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
      status: 200,
    });
  } catch (error: any) {
    if (browser) await browser.close().catch(() => {});
    console.error("Screenshot error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to take screenshot" },
      { status: 500 },
    );
  }
}
