import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { title, artist, duration } = await req.json();

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const trackDuration = duration ? parseFloat(duration) : 240; // Default to 4 minutes

    const sections = generateFallbackSections(trackDuration);

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
