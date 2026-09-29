import { SITE_NAME, SITE_TAGLINE } from "@/lib/siteStructure";

export const SITE_URL = "https://cloud-palette.com";

/**
 * 頁ごとの openGraph（共有したときのカード）。
 *
 * ## なぜ要るか（2026-09-30）
 *
 * ルートの layout は openGraph に**ホームの**題・説明・URL を持つ。子の頁が
 * openGraph を書かないと、それを丸ごと継承するので、SNS やチャットで
 * about・/houi などを共有するとホームのカードになっていた（og:url も
 * ホーム）。逆に openGraph を書くと丸ごと置き換わるので、siteName・
 * locale・画像を書き忘れるとそれが消える。
 *
 * 頁は path・題・説明だけ渡し、共通の項目はここで埋める。題はルートの
 * title.template と同じ「… | Cloud Palette」にする（openGraph の title には
 * template が掛からない）。
 */
export function pageOpenGraph(
  path: string,
  title: string,
  description: string,
) {
  return {
    title: `${title} | ${SITE_NAME}`,
    description,
    url: `${SITE_URL}${path}`,
    siteName: SITE_NAME,
    locale: "ja_JP",
    type: "website" as const,
    images: [
      {
        url: "/ogp.png",
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} - ${SITE_TAGLINE}`,
      },
    ],
  };
}
