import { NextResponse } from 'next/server';
import { streamText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createClient } from '@/utils/supabase/server';
import { decrypt } from '@/utils/encryption';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (!session || authError) {
      return NextResponse.json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
    }

    const body = await req.json();
    const { prompt } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Get the user's config to fetch the encrypted API key
    const { data: userConfig, error: configError } = await supabase
      .from('user_configs')
      .select('encrypted_gemini_key')
      .eq('user_email', session.user.email)
      .single();

    let apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;

    if (userConfig?.encrypted_gemini_key) {
      const decryptedKey = decrypt(userConfig.encrypted_gemini_key);
      if (decryptedKey) apiKey = decryptedKey;
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'No Gemini API key found. Please configure it in your settings.' }, { status: 403 });
    }

    const google = createGoogleGenerativeAI({ apiKey });

    const result = await streamText({
      model: google('gemini-3.1-pro') as any,
      prompt,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('Expert API Error:', error);
    return NextResponse.json({ error: 'Failed to process request.' }, { status: 500 });
  }
}

