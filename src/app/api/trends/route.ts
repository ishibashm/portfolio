import { NextResponse } from 'next/server';

export async function GET() {
  const gasUrl = process.env.GAS_WEBAPP_URL || process.env.GAS_WEB_APP_URL;
  if (!gasUrl) {
    console.error("GAS Web App URL is not configured in environment variables.");
    return NextResponse.json(
      { error: 'Backend server URL is not configured' },
      { status: 500 }
    );
  }

  try {
    // Fetch with cache revalidation of 60 seconds
    const response = await fetch(gasUrl, {
      method: 'GET',
      next: { revalidate: 60 },
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      console.error(`GAS returned error status: ${response.status}`);
      return NextResponse.json(
        { error: `Backend service returned error: ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error proxying trends GET request:", error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
