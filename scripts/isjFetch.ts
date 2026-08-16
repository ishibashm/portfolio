/**
 * 国土交通省「位置参照情報」（ISJ）大字・町丁目レベルの取得。
 *
 * import_isj_coords.ts（郵便番号の座標埋め）から切り出した。
 * 成約価格の座標埋め（import_property_transactions.ts の isjfill）も
 * 同じ一覧を使うため、取り方を 2 か所に書かない。
 *
 * ここは**ネットワークからの取得だけ**を受け持つ。zip の解釈・CSV の
 * 解析・鍵の作り方は isjParse.ts（純粋関数）にある。
 *
 * 環境変数
 *   ISJ_VERSION    版数。既定 19.0b（令和 7 年度）
 *   ISJ_PREFS      都道府県コードを絞る（"01,13" など）。既定は 47 全部
 *   ISJ_SOURCE_URL 1 県ぶんの zip を直に指定する（probe の確認用）
 */

import { decode } from "./isjParse";

export const ISJ_VERSION = process.env.ISJ_VERSION || "19.0b";

const UA =
  "Mozilla/5.0 (compatible; cloud-palette/1.0; +https://cloud-palette.com)";

/** 配布ページ。直リンクが全滅したときにここからリンクを拾う。 */
const INDEX_PAGES = [
  "https://nlftp.mlit.go.jp/cgi-bin/isj/dls/_choose_files.cgi",
  "https://nlftp.mlit.go.jp/isj/index.html",
];

export function prefectureCodes(): string[] {
  if (process.env.ISJ_PREFS) {
    return process.env.ISJ_PREFS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, "0"));
}

/**
 * 1 県ぶんの zip の候補。**上から順に試す。**
 *
 * 決め打ちにしない。日本郵便で置き場が変わって 2 回外している
 * （#342・#343）。ここも版数の書き方が meta では 19b、データ側では
 * 19.0b と揺れているので、両方を候補に入れる。
 * どれが何を返したかは全部ログに出す。
 */
export function zipCandidates(pref: string): string[] {
  if (process.env.ISJ_SOURCE_URL) return [process.env.ISJ_SOURCE_URL];
  const short = ISJ_VERSION.replace(".0", ""); // 19.0b -> 19b
  return [
    `https://nlftp.mlit.go.jp/isj/dls/data/${ISJ_VERSION}/${pref}000-${ISJ_VERSION}.zip`,
    `https://nlftp.mlit.go.jp/isj/dls/data/${short}/${pref}000-${ISJ_VERSION}.zip`,
    `https://nlftp.mlit.go.jp/isj/dls/data/${ISJ_VERSION}/${pref}000-${short}.zip`,
  ];
}

export async function tryDownload(
  url: string,
  tried: string[],
): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) {
      tried.push(`${res.status} ${url}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    // 案内ページの HTML が 200 で返ることがある。中身が zip か確かめる。
    if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) {
      tried.push(`zip ではない (${buf.length} bytes) ${url}`);
      return null;
    }
    return buf;
  } catch (e) {
    tried.push(`${String(e).slice(0, 60)} ${url}`);
    return null;
  }
}

/** 配布ページの HTML から zip へのリンクを拾う。 */
export async function discoverZipLinks(): Promise<string[]> {
  const found: string[] = [];
  for (const page of INDEX_PAGES) {
    try {
      const res = await fetch(page, {
        headers: { "User-Agent": UA, Accept: "*/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) {
        console.log(`  × ${res.status} ${page}`);
        continue;
      }
      const html = decode(Buffer.from(await res.arrayBuffer()));
      const links = [...html.matchAll(/href="([^"]+\.zip)"/gi)].map(
        (m) => m[1],
      );
      console.log(`  ○ ${page} — zip リンク ${links.length} 件`);
      for (const href of links) {
        try {
          const abs = new URL(href, page).toString();
          if (!found.includes(abs)) found.push(abs);
        } catch {
          /* 壊れた href は飛ばす */
        }
      }
    } catch (e) {
      console.log(`  × ${String(e).slice(0, 60)} ${page}`);
    }
  }
  return found;
}

export async function downloadPrefecture(
  pref: string,
): Promise<{ url: string; buf: Buffer } | null> {
  const tried: string[] = [];
  for (const url of zipCandidates(pref)) {
    const buf = await tryDownload(url, tried);
    if (buf) return { url, buf };
  }
  console.log(`  × ${pref} を取得できません:`);
  for (const t of tried) console.log(`      ${t}`);
  return null;
}
