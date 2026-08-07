import { NextResponse } from "next/server";
import { getAdsenseIds } from "@/lib/adsense";

export const runtime = "nodejs";
export const revalidate = 86400; // 24 hours cache

/**
 * ads.txt（Authorized Digital Sellers）。
 *
 * 以前は NEXT_PUBLIC_ADSENSE_ID が未設定のとき "pub-0000000000000000" という
 * 架空のパブリッシャー ID を本番で配信していた。ads.txt は「この ID の広告なら
 * 正規」と宣言するファイルなので、実在しない ID を載せると
 *
 *   - Google のクローラに不正なエントリとして記録される
 *   - AdSense の審査・配信開始時に「未承認の販売者」として弾かれうる
 *
 * ID が無いなら、間違ったことを書くより何も置かないほうがよい。404 を返す。
 */
export async function GET() {
  const customAdsContent = process.env.ADS_TXT_CONTENT;
  // ads.txt は "pub-" の形（"ca-pub-" ではない）。
  const adsenseId = getAdsenseIds()?.adsTxt;

  if (!customAdsContent && !adsenseId) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

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
