import { NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { createClient } from '@/utils/supabase/server';
import { z } from 'zod';
import { maskPII } from '@/utils/anonymizer';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { content } = await req.json();

    if (!content) {
      return NextResponse.json({ error: 'Content is required.' }, { status: 400 });
    }

    // Auto-Categorization logic using Gemini (Vercel AI SDK)
    const maskedContent = maskPII(content);

    const result = await generateObject({
      model: google('gemini-1.5-pro'),
      schema: z.object({
        tags: z.array(z.string()).describe('List of 3 to 5 highly relevant tags/categories for this document.'),
        summary: z.string().describe('A concise 1-2 sentence summary of the document.'),
      }),
      prompt: `Please analyze the following markdown document and extract relevant tags and a short summary.\n\nDocument Content:\n${maskedContent}`,
    });

    return NextResponse.json(result.object);
  } catch (error) {
    console.error('Categorize API Error:', error);
    return NextResponse.json({ error: 'Failed to categorize document.' }, { status: 500 });
  }
}
