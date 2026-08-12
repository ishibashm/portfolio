import { NextResponse } from "next/server";
import { toResponseMessage } from "@/lib/errorMessage";
import { exec } from "child_process";
import path from "path";
import util from "util";

const execPromise = util.promisify(exec);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");

  if (!ticker) {
    return NextResponse.json(
      { success: false, error: "Ticker is required" },
      { status: 400 },
    );
  }

  try {
    const scriptPath = path.join(
      process.cwd(),
      "scripts",
      "python_tools",
      "fetch_omni_data.py",
    );

    // Call the python script. Ensure python is in PATH or specify absolute path to python executable if needed.
    let pythonCmd = "python3";
    try {
      await execPromise("python3 --version");
    } catch {
      pythonCmd = "python";
    }

    const { stdout, stderr } = await execPromise(
      `${pythonCmd} "${scriptPath}" "${ticker}"`,
    );

    if (stderr) {
      console.warn("Python script stderr:", stderr);
    }

    // Extract JSON part in case Python printed warnings before the JSON
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
  } catch (error) {
    console.error("Omni API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: toResponseMessage(error, "Failed to fetch stock data"),
      },
      { status: 500 },
    );
  }
}
