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
    
    // Ensure python command is fitting for the environment
    // On Vercel, this won't work out of the box without special configuration.
    // For local Windows, 'python' is standard.
    const command = `python "${scriptPath}" --url "${targetUrl}" --output "${outputDir}"`;
    
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
      { error: 'Failed to run scraper', details: error.message },
      { status: 500 }
    );
  }
}
