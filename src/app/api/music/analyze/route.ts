import { NextResponse } from "next/server";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const google = createGoogleGenerativeAI({
  apiKey:
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { title, artist, duration } = await req.json();

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const trackDuration = duration ? parseFloat(duration) : 240; // Default to 4 minutes

    const prompt = `You are a professional musicologist and music structure analyzer. 
Analyze the structure of the song "${title}" by "${artist}". The song is ${trackDuration} seconds long.
Break down the song into contiguous, chronological sections (e.g. Intro, Verse, Chorus, Bridge, Guitar Solo, Outro, etc.).
For each section, provide:
1. "name": short English name (e.g. Intro, Verse 1, Chorus 1, Guitar Solo, Bridge, Last Chorus, Outro)
2. "label": Japanese name (e.g. イントロ, Aメロ (1番), Bメロ (1番), サビ (1番), ギターソロ, Cメロ (ブリッジ), ラストサビ, アウトロ)
3. "startTime": start time in seconds (must be integer or number)
4. "endTime": end time in seconds (must be integer or number)
5. "energy": energy level from 1 to 5 (integer representing intensity/volume/build-up)
6. "note": Japanese lyric snippet or brief musical note (e.g. lyrics snippet or "演奏のみ", "ギター・ドラムイン")

If you are familiar with this specific song, please use its ACTUAL sections and lyrics. If you do not know the song, generate a highly plausible pop/rock structure that fits the duration of ${trackDuration} seconds exactly.

CRITICAL REQUIREMENTS:
- The first section MUST start at startTime 0.
- The last section MUST end at endTime ${trackDuration}.
- All sections MUST be contiguous (the endTime of one section must equal the startTime of the next).
- Output ONLY a valid JSON array of these sections. Do not include markdown code block formatting (no \`\`\`json or \`\`\` backticks).

Example Output Format:
[
  {
    "name": "Intro",
    "label": "イントロ (サビ頭)",
    "startTime": 0,
    "endTime": 11,
    "energy": 4,
    "note": "「愛が愛を「重過ぎる」って理解を拒み...」"
  }
]`;

    const { text } = await generateText({
      model: google("gemini-3.5-flash"),
      prompt,
      temperature: 0.2,
    });

    let cleanJson = text.trim();
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson
        .replace(/^```json/, "")
        .replace(/```$/, "")
        .trim();
    } else if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```/, "").replace(/```$/, "").trim();
    }

    let sections = [];
    try {
      sections = JSON.parse(cleanJson);

      // Post-process to ensure strict validation of start/end times and contiguity
      if (Array.isArray(sections) && sections.length > 0) {
        sections[0].startTime = 0;
        for (let i = 1; i < sections.length; i++) {
          sections[i].startTime = sections[i - 1].endTime;
        }
        sections[sections.length - 1].endTime = trackDuration;
      }
    } catch (e) {
      console.warn(
        "Failed to parse Gemini json output, using fallback generator:",
        e,
      );
      // Fallback generator in case JSON parsing fails
      sections = generateFallbackSections(trackDuration);
    }

    return NextResponse.json({
      sections,
    });
  } catch (error: any) {
    console.error("Error analyzing music structure:", error);
    return NextResponse.json(
      { error: "Failed to analyze music structure" },
      { status: 500 },
    );
  }
}

function generateFallbackSections(duration: number) {
  const introLen = Math.min(15, Math.floor(duration * 0.08));
  const verse1Len = Math.floor(duration * 0.18);
  const prechorus1Len = Math.floor(duration * 0.08);
  const chorus1Len = Math.floor(duration * 0.15);
  const verse2Len = Math.floor(duration * 0.15);
  const chorus2Len = Math.floor(duration * 0.15);
  const bridgeLen = Math.floor(duration * 0.12);
  const outroLen =
    duration -
    (introLen +
      verse1Len +
      prechorus1Len +
      chorus1Len +
      verse2Len +
      chorus2Len +
      bridgeLen);

  const rawStructure = [
    {
      name: "Intro",
      label: "イントロ",
      duration: introLen,
      energy: 2,
      note: "演奏のみ - 導入部",
    },
    {
      name: "Verse 1",
      label: "Aメロ (1番)",
      duration: verse1Len,
      energy: 2,
      note: "歌唱スタート",
    },
    {
      name: "Pre-Chorus 1",
      label: "Bメロ (1番)",
      duration: prechorus1Len,
      energy: 3,
      note: "サビへのビルドアップ",
    },
    {
      name: "Chorus 1",
      label: "サビ (1番)",
      duration: chorus1Len,
      energy: 4,
      note: "メインテーマ・メロディ",
    },
    {
      name: "Verse 2",
      label: "Aメロ (2番)",
      duration: verse2Len,
      energy: 2,
      note: "2コーラス目",
    },
    {
      name: "Chorus 2",
      label: "サビ (2番)",
      duration: chorus2Len,
      energy: 4,
      note: "サビ繰り返し",
    },
    {
      name: "Bridge",
      label: "Cメロ (ブリッジ)",
      duration: bridgeLen,
      energy: 3,
      note: "楽曲の展開部",
    },
    {
      name: "Outro",
      label: "アウトロ",
      duration: outroLen,
      energy: 2,
      note: "フェードアウト",
    },
  ];

  let current = 0;
  return rawStructure.map((sec) => {
    const start = current;
    const end = Math.min(duration, current + sec.duration);
    current = end;
    return {
      name: sec.name,
      label: sec.label,
      startTime: start,
      endTime: end,
      energy: sec.energy,
      note: sec.note,
    };
  });
}
