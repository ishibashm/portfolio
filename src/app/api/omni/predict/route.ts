import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import util from 'util';

const execPromise = util.promisify(exec);

export async function POST(req: Request) {
  try {
    const { ticker } = await req.json();
    if (!ticker) {
      return NextResponse.json({ success: false, error: 'Ticker is required' }, { status: 400 });
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'python_tools', 'predict_stock.py');
    const { stdout, stderr } = await execPromise(`python "${scriptPath}" "${ticker}"`);
    
    if (stderr) {
      console.warn("Python script stderr:", stderr);
    }

    // Extract JSON part in case Python printed warnings before the JSON
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`Failed to extract JSON from python output. Raw output: ${stdout.substring(0, 100)}...`);
    }

    const data = JSON.parse(jsonMatch[0]);
    if (data.success) {
      return NextResponse.json(data);
    } else {
      return NextResponse.json({ success: false, error: data.error }, { status: 500 });
    }

  } catch (error: any) {
    console.error("Omni API Predict Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
