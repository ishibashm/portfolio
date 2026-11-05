/**
 * 運営チャンネル。JSON-LD の sameAs と、頁に出すリンクは同じ URL を使う。
 * ここに無いチャンネルは載せない（layout の sameAs と同じ規則）。
 */
export const HOUI_SUMAI_CHANNEL = {
  name: "方位と住まいの手帖",
  url: "https://www.youtube.com/@houi-sumai-techo",
} as const;

export const YOUTUBE_CHANNELS = [
  HOUI_SUMAI_CHANNEL,
  {
    name: "Penthouse Focus",
    url: "https://www.youtube.com/@penthouse-focus",
  },
  {
    name: "AIの数式",
    url: "https://www.youtube.com/@AIの数式",
  },
] as const;

/** Organization.sameAs。YouTube 3 つと X。順序を変えると宣言がずれる。 */
export const SITE_SAME_AS = [
  ...YOUTUBE_CHANNELS.map((channel) => channel.url),
  "https://x.com/cloud8wq",
] as const;
