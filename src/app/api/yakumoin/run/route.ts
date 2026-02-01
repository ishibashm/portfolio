import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const { date, birthDate } = await request.json();
    
    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }

    if (!birthDate) {
        return NextResponse.json({ error: 'Birth Date is required' }, { status: 400 });
    }
    
    // Ensure date and birthDate are in YYYYMMDD format (remove dashes if present)
    const cleanDate = date.replace(/-/g, '');
    const cleanBirthDate = birthDate.replace(/-/g, '');
    
    // Correct logic: Base URL is the Birthday Page
    // The scraper will then POST the target date to get the correct data
    const targetUrl = `https://yakumoin.info/check/direction/day/${cleanBirthDate}`;
    
    const scriptPath = path.join(process.cwd(), 'src', 'scripts', 'yakumoin-scraper', 'snapshot.py');
    const outputDir = path.join(process.cwd(), 'public', 'scraped_data');
    const baseFilename = `yakumoin_${cleanDate}`;

    // Determine Python executable based on platform
    let pythonPath = process.env.PYTHON_PATH || 'python'; 
    
    if (!process.env.PYTHON_PATH) {
      if (process.platform === 'win32') {
          const localPy = 'C:\\Users\\ishib\\AppData\\Local\\Programs\\Python\\Python310\\python.exe';
          if (fs.existsSync(localPy)) {
              pythonPath = localPy;
          }
      } else {
          pythonPath = 'python3';
      }
    }

    // Pass target-date to the script so it can perform the POST interaction
    const command = `"${pythonPath}" "${scriptPath}" --url "${targetUrl}" --output "${outputDir}" --filename "${baseFilename}" --target-date "${cleanDate}"`;
    
    console.log(`Executing: ${command}`);
    
    const { stdout, stderr } = await execAsync(command);
    
    console.log('stdout:', stdout);
    
    if (stderr) {
      console.error('stderr:', stderr);
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Scraping completed',
      stdout,
      outputDir: '/scraped_data',
      filename: baseFilename
    });
    
  } catch (error: any) {
    console.error('Scraping error:', error);
    return NextResponse.json(
      { error: 'Failed to run scraper', details: error.message, stderr: error.stderr || '' },
      { status: 500 }
    );
  }
}
