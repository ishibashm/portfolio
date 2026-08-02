import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 86400; // 24 hours cache

export async function GET() {
  const adsenseId = process.env.NEXT_PUBLIC_ADSENSE_ID || "pub-0000000000000000";
  const customAdsContent = process.env.ADS_TXT_CONTENT;

  const content =
    customAdsContent ||
    `# Authorized Digital Sellers (ads.txt) for Cloud Palette
# https://cloud-palette.com

google.com, ${adsenseId}, DIRECT, f08c47fec0942fa0
`;

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
