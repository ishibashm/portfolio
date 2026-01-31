import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const { date } = await request.json();
    
    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }
    
    // Construct URL based on date (YYYYMMDD)
    const targetUrl = `https://yakumoin.info/check/direction/day/${date}`;
    
    const scriptPath = path.join(process.cwd(), 'src', 'scripts', 'yakumoin-scraper', 'snapshot.py');
    const outputDir = path.join(process.cwd(), 'public', 'scraped_data');
    
    // Determine Python executable based on platform
    let pythonPath = process.env.PYTHON_PATH || 'python'; 
    
    if (!process.env.PYTHON_PATH) {
      if (process.platform === 'win32') {
          // Local Windows Development
          pythonPath = 'C:\\Users\\ishib\\AppData\\Local\\Programs\\Python\\Python310\\python.exe';
      } else {
          // Linux / Production (GCP) - Fallback if env var not set
          pythonPath = 'python3';
      }
    }

    const command = `"${pythonPath}" "${scriptPath}" --url "${targetUrl}" --output "${outputDir}"`;
    
    console.log(`Executing: ${command}`);
    
    const { stdout, stderr } = await execAsync(command);
    
    console.log('stdout:', stdout);
    
    if (stderr) {
      console.error('stderr:', stderr);
    }
    
    // Parse output to find created files (optional, or just return success)
    return NextResponse.json({ 
      success: true, 
      message: 'Scraping completed',
      stdout,
      outputDir: '/scraped_data' 
    });
    
  } catch (error: any) {
    console.error('Scraping error:', error);
    return NextResponse.json(
      { error: 'Failed to run scraper', details: error.message, stderr: error.stderr || '' },
      { status: 500 }
    );
  }
}
