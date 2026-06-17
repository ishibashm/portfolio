import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import util from "util";
import fs from "fs";

const execPromise = util.promisify(exec);

export async function POST(req: Request) {
  let tempFilePath: string | null = null;
  try {
    const { ticker, html } = await req.json();
    
    if (!ticker && !html) {
      return NextResponse.json(
        { success: false, error: "Ticker or HTML content is required" },
        { status: 400 },
      );
    }

    const scriptPath = path.join(
      process.cwd(),
      "scripts",
      "python_tools",
      "yfinance_quant.py",
    );
    
    let pythonCmd = "python3";
    try {
      await execPromise("python3 --version");
    } catch {
      pythonCmd = "python";
    }

    let commandArgs = "";
    if (html) {
      // Create a temp file in scratch directory
      const scratchDir = path.join(process.cwd(), "scratch");
      if (!fs.existsSync(scratchDir)) {
        fs.mkdirSync(scratchDir);
      }
      tempFilePath = path.join(scratchDir, `temp_pasted_stock_${Date.now()}.html`);
      fs.writeFileSync(tempFilePath, html, "utf-8");
      
      commandArgs = `--html "${tempFilePath}"`;
    } else {
      commandArgs = `"${ticker}"`;
    }

    const { stdout, stderr } = await execPromise(
      `${pythonCmd} "${scriptPath}" ${commandArgs}`,
    );

    // Clean up temp file immediately after exec
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        tempFilePath = null;
      } catch (e) {
        console.error("Failed to delete temp file:", e);
      }
    }

    if (stderr) {
      console.warn("Python script stderr:", stderr);
    }

    // Extract JSON part in case Python printed warnings or extraneous logs before the JSON
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(
        `Failed to extract JSON from python output. Raw output: ${stdout.substring(0, 100)}...`,
      );
    }

    const data = JSON.parse(jsonMatch[0]);
    if (data.success) {
      return NextResponse.json(data);
    } else {
      return NextResponse.json(
        { success: false, error: data.error },
        { status: 500 },
      );
    }
  } catch (error: any) {
    console.error("YFinance Quant API Error:", error);
    // Cleanup on error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch {}
    }
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
