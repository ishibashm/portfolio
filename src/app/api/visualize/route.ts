import { NextResponse } from "next/server";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const google = createGoogleGenerativeAI({
  apiKey:
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

export const maxDuration = 60; // Allow more time for generation

export async function POST(req: Request) {
  try {
    const {
      inputData,
      style = "twitter-card",
      previousHtml,
      iterationInstruction,
    } = await req.json();

    const isIteration = !!(previousHtml && iterationInstruction);

    if (!isIteration && !inputData) {
      return NextResponse.json(
        { error: "Input data is required for new visualizations" },
        { status: 400 },
      );
    }

    let systemPrompt = "";
    let prompt = "";

    if (isIteration) {
      systemPrompt = `You are an expert UI/UX designer and a master of Tailwind CSS.
Your task is to modify the provided HTML component according to the user's feedback/request.

Constraints:
1. Output ONLY the updated body HTML code (usually a single wrapping <div> with inner elements). Do NOT wrap it in markdown code blocks (e.g. no \`\`\`html).
2. Use Tailwind CSS v4 classes for all styling. Do not write custom CSS.
3. Keep the original text content, data, and structure unless the user explicitly requested to change them.
4. Keep the design responsive, dark mode by default, elegant typography, generous padding, subtle gradients, and glassmorphism (backdrop-blur) where appropriate.
5. Do NOT include <html>, <head>, or <body> tags. Just output the inner component wrapper (e.g. <div class="...">...</div>).
6. Make it look like a high-end, premium design (similar to Vercel, Linear, or Stripe).`;

      prompt = `Here is the current HTML component code:
${previousHtml}

User's instruction for modification:
"${iterationInstruction}"

Please output the modified HTML code. Remember: only return the HTML string itself, no markdown backticks, no comments, no preamble.`;
    } else {
      systemPrompt = `You are an expert UI/UX designer and a master of Tailwind CSS.
Your task is to take the provided raw data (e.g., a social media post, a real estate listing, or plain text) and visualize it as a beautiful, production-ready HTML component.

Constraints:
1. Output ONLY valid HTML code representing the component wrapper (usually a single wrapping <div> with inner elements). Do NOT wrap it in markdown code blocks (e.g. no \`\`\`html).
2. Use Tailwind CSS v4 classes for all styling. Do not write custom CSS.
3. Design a responsive card or full-page layout depending on the content. For a social media post, use an aspect ratio roughly around 16:9 (e.g., max-width: 800px) centered on the screen.
4. Use a dark mode theme by default (e.g., bg-zinc-950, text-white, subtle borders).
5. Add elegant typography, generous padding, subtle gradients, and glassmorphism effects (backdrop-blur) where appropriate.
6. Make it look like a high-end, premium design (similar to Vercel, Linear, or Stripe).
7. If the data contains an image URL or media, render it beautifully as a background or hero image with proper aspect-video and object-cover.
8. Do NOT output <html>, <head>, or <body> tags. Just output the inner component wrapper (e.g. <div class="...">...</div>).

Target Style: ${style}

If it's 'twitter-card', make it look like a beautiful quoted tweet poster.
If it's 'real-estate', make it look like a high-end property listing card.
If it's 'dashboard-widget', make it look like a dashboard analytical widget with metrics, trends, and charts.
If it's 'magazine-article', make it look like an editorial magazine layout.
If it's 'music-dashboard', make it look like a gorgeous, glassmorphic Spotify/Apple Music-style song card or dashboard, featuring a beautiful record sleeve/cover gradient, track meta info (BPM, Key, Energy), a stylish progress bar, and play/pause controls. If the input data contains a 'sections' array, the dashboard MUST include a 'Song Structure Analysis' panel. This panel should feature: 1) A segmented horizontal timeline bar (widths proportional to section durations, color-coded by section type like Intro, Verse, Chorus, Bridge, Outro), 2) An aligned bar chart showing the energy/intensity of each section, and 3) A clean, dark-themed sections table listing Index, Section Name (with color dot), Time Range, Duration, Energy (represented by star icons), and Notes/Lyrics. Make sure clicking any timeline block or table row seeks the playback (by calling a mock seek function or linking interactive buttons).`;

      prompt = `Raw Data to Visualize:
${typeof inputData === "string" ? inputData : JSON.stringify(inputData, null, 2)}`;
    }

    const { text } = await generateText({
      model: google("gemini-3.5-flash"),
      prompt: `${systemPrompt}\n\n${prompt}`,
      temperature: 0.7,
    });

    // Clean up potential markdown formatting if the model disobeys
    let cleanHtml = text.trim();
    if (cleanHtml.startsWith("\`\`\`html")) {
      cleanHtml = cleanHtml
        .replace(/^\`\`\`html/, "")
        .replace(/\`\`\`$/, "")
        .trim();
    } else if (cleanHtml.startsWith("\`\`\`")) {
      cleanHtml = cleanHtml
        .replace(/^\`\`\`/, "")
        .replace(/\`\`\`$/, "")
        .trim();
    }

    // Add necessary Tailwind script and default base styles for the iframe sandbox preview to work
    const htmlWithTailwind = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://unpkg.com/@tailwindcss/browser@4"></script>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #09090b;
      color: white;
      font-family: system-ui, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
    }
  </style>
</head>
<body>
  ${cleanHtml}
</body>
</html>`;

    return NextResponse.json({
      cleanHtml,
      html: htmlWithTailwind,
    });
  } catch (error) {
    console.error("Error in visualize API:", error);
    return NextResponse.json(
      { error: "Failed to generate visualization" },
      { status: 500 },
    );
  }
}
