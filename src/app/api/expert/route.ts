import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prompt, model = 'gemma4' } = body;

    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: true,
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Ollama API request failed: ${response.statusText}` }, { status: response.status });
    }

    // Proxy the stream back to the client directly
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Expert API Proxy Error:', error);
    return NextResponse.json({ error: 'Failed to contact local LLM. Make sure Ollama is running on port 11434.' }, { status: 500 });
  }
}
