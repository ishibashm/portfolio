import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembedUrl);

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch YouTube oembed metadata" },
        { status: res.status },
      );
    }

    const data = await res.json();

    return NextResponse.json({
      title: data.title || "YouTube Video",
      author: data.author_name || "YouTube Creator",
      thumbnail: data.thumbnail_url || "",
      provider: data.provider_name || "YouTube",
    });
  } catch (error) {
    console.error("YouTube OEmbed fetch error:", error);
    return NextResponse.json(
      { error: "Failed to load video metadata" },
      { status: 500 },
    );
  }
}
