import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import {
  unzipEntries,
  pickCsv,
  decode,
  describeEncodings,
  parseCsv,
  stripChome,
  push,
  averagePoint,
  type IsjRow,
} from "./isjParse";

/**
 * 郵便番号の座標を、**まとめ取りした一覧で埋める。**
 *
 * これまでは scripts/import_postal_codes.ts の 2 段目が、1 件ずつ
 * 国土地理院へ問い合わせて埋めていた。実測は 50 分で 5,333 件
 * （約 107 件/分）。残り 11 万件で **約 18 時間**、50 分区切りで 22 回。
 * 回せば終わるが、公共の口を 12 万回叩くうえに手動実行が 22 回になる。
 *
 * 代わりに、国土交通省「位置参照情報」の**大字・町丁目レベル**を使う。
 * 都道府県ごとの zip（各 0.03〜0.35MB）に、
 *
 *   都道府県名 / 市区町村名 / 大字町丁目名 / 緯度 / 経度
 *
 * が入っている。47 件を落として突き合わせれば、**1 回の実行で大半が
 * 埋まる**（郵便番号の 1 段目と同じ形）。
 *
 * 測地系は世界測地系で、AddressSearch と同じ。**判定の答えは変わらない。**
 *
 * すでに埋まっている行は触らない（WHERE lat IS NULL）。1 件ずつの
 * 引き方も消していない。ここで漏れた住所は、これまで通り geocode の段が
 * 拾う。回数がずっと減るので、そちらは現実的な時間で終わる。
 *
 * 使い方:
 *   ISJ_STAGE=probe npx tsx scripts/import_isj_coords.ts   # 形を見るだけ
 *   ISJ_STAGE=fill  npx tsx scripts/import_isj_coords.ts   # 埋める
 *
 * 環境変数
 *   ISJ_STAGE      probe（既定）/ fill
 *   ISJ_VERSION    版数。既定 19.0b（令和 7 年度）
 *   ISJ_PREFS      都道府県コードを絞る（"01,13" など）。既定は 47 全部
 *   ISJ_SOURCE_URL 1 県ぶんの zip を直に指定する（probe の確認用）
 */

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set.");
}

const STAGE = process.env.ISJ_STAGE || "probe";
const VERSION = process.env.ISJ_VERSION || "19.0b";

const UA =
  "Mozilla/5.0 (compatible; cloud-palette/1.0; +https://cloud-palette.com)";

/** 配布ページ。直リンクが全滅したときにここからリンクを拾う。 */
const INDEX_PAGES = [
  "https://nlftp.mlit.go.jp/cgi-bin/isj/dls/_choose_files.cgi",
  "https://nlftp.mlit.go.jp/isj/index.html",
];

function prefectureCodes(): string[] {
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
function zipCandidates(pref: string): string[] {
  if (process.env.ISJ_SOURCE_URL) return [process.env.ISJ_SOURCE_URL];
  const short = VERSION.replace(".0", ""); // 19.0b -> 19b
  return [
    `https://nlftp.mlit.go.jp/isj/dls/data/${VERSION}/${pref}000-${VERSION}.zip`,
    `https://nlftp.mlit.go.jp/isj/dls/data/${short}/${pref}000-${VERSION}.zip`,
    `https://nlftp.mlit.go.jp/isj/dls/data/${VERSION}/${pref}000-${short}.zip`,
  ];
}

async function tryDownload(
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
async function discoverZipLinks(): Promise<string[]> {
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

async function downloadPrefecture(
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

/**
 * 形を確かめるだけ。**1 行も書き込まない。**
 * 取得できた URL・文字コード・見出し・値の例を出す。
 */
async function stageProbe() {
  const pref = prefectureCodes()[0];
  console.log(`形を確認します: 都道府県コード ${pref} / 版 ${VERSION}`);
  console.log("候補:");
  for (const u of zipCandidates(pref)) console.log(`  ${u}`);

  const got = await downloadPrefecture(pref);
  if (!got) {
    console.log("\n直リンクが全滅。配布ページからリンクを探します:");
    const links = await discoverZipLinks();
    if (links.length === 0) {
      console.log(
        "\n配布ページからも zip のリンクを拾えませんでした。\n" +
          "選択が CGI の POST になっている可能性があります。その場合は、\n" +
          "手元のブラウザで 1 県ぶん落として URL を控え、ISJ_SOURCE_URL に\n" +
          "渡して再実行してください（1 件で形が分かれば残りは決まります）。",
      );
      return;
    }
    console.log(`拾えたリンク ${links.length} 件（先頭 20 件）:`);
    for (const u of links.slice(0, 20)) console.log(`  ${u}`);
    return;
  }

  console.log(`\n○ 取得できました: ${got.url}`);

  const entries = unzipEntries(got.buf);
  console.log(`\n■ zip の中身（${entries.length} 項目）`);
  for (const e of entries) console.log(`  ${e.name} (${e.body.length} bytes)`);

  const csv = pickCsv(entries);
  console.log(`\n■ 使う CSV: ${csv.name}`);

  const text = decode(csv.body);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  console.log(`  行数: ${lines.length}`);
  console.log(`\n■ 見出し\n  ${lines[0]}`);
  console.log(`\n■ 値の例（先頭 3 行）`);
  for (const l of lines.slice(1, 4)) console.log(`  ${l}`);

  /*
    ここで落ちても probe は止めない。**何が見えたかを全部出してから
    終わる**ほうが、次に直すときに推測しなくて済む。
  */
  let rows: IsjRow[] = [];
  try {
    rows = parseCsv(text);
  } catch (e) {
    console.log(`\n× 列を引けませんでした: ${String(e)}`);
    console.log("\n■ 文字コードの読み比べ");
    console.log(describeEncodings(csv.body));
    return;
  }

  console.log(`\n■ 読めた件数: ${rows.length}`);
  if (rows.length > 0) {
    const r = rows[0];
    console.log(
      `  例: ${r.pref}${r.city}${r.town} → ${r.lat} / ${r.lon}\n` +
        `  丁目を落とした鍵: ${r.pref}${r.city}${stripChome(r.town)}`,
    );
  }
  console.log(
    "\n文字化けしていなければ、このまま ISJ_STAGE=fill で埋められます。",
  );
}

async function stageFill(pool: Pool) {
  /*
    3 通りの鍵を作る。細かいほうから順に当てる。

      1. 都道府県+市区町村+大字町丁目名        （そのまま）
      2. 都道府県+市区町村+丁目を落とした名前  （郵便番号側は丁目が無い）
      3. 都道府県+市区町村                     （「以下に掲載がない場合」用）

    2 と 3 は同じ鍵に複数の点が来るので平均を取る。町の代表点なので、
    町丁目より粗いが、**判定に使う八方位は変わらない距離**に収まる
    （実測で 92.8% の物件が市区町村中央値から 5km 以内、#333）。
  */
  const exact = new Map<string, { lat: number; lon: number }>();
  const baseGroups = new Map<string, { lat: number; lon: number }[]>();
  const cityGroups = new Map<string, { lat: number; lon: number }[]>();

  let files = 0;
  for (const pref of prefectureCodes()) {
    const got = await downloadPrefecture(pref);
    if (!got) continue;
    files++;

    const rows = parseCsv(decode(pickCsv(unzipEntries(got.buf)).body));
    for (const r of rows) {
      const point = { lat: r.lat, lon: r.lon };
      exact.set(`${r.pref}${r.city}${r.town}`, point);

      push(baseGroups, `${r.pref}${r.city}${stripChome(r.town)}`, point);
      push(cityGroups, `${r.pref}${r.city}`, point);
    }
    console.log(`  ${pref}: ${rows.length} 件（累計の鍵 ${exact.size}）`);

    // 提供元に連続で当てない。zip は小さいので短くてよい。
    await new Promise((r) => setTimeout(r, 300));
  }

  if (files === 0) {
    throw new Error(
      "1 県も取得できませんでした。ISJ_STAGE=probe で置き場を確かめてください。",
    );
  }

  const base = new Map<string, { lat: number; lon: number }>();
  for (const [k, v] of baseGroups) base.set(k, averagePoint(v));
  const city = new Map<string, { lat: number; lon: number }>();
  for (const [k, v] of cityGroups) city.set(k, averagePoint(v));

  console.log(
    `\n一覧の用意ができました: そのまま ${exact.size} / 丁目落とし ${base.size} / 市区町村 ${city.size}`,
  );

  /*
    座標が空の行だけを見る。**埋まっている行は触らない**
    （1 件ずつ引いて埋めた 5,333 件を消さない）。
    code のカーソルで前へ進める。当たらなかった行が居座って
    同じ範囲を読み直すのを避ける（郵便番号の 2 段目と同じ理由）。
  */
  let cursor = "0000000";
  let filled = 0;
  let missed = 0;
  const hits = { exact: 0, base: 0, city: 0 };

  while (true) {
    const { rows } = await pool.query<{ code: string; address: string }>(
      `SELECT code, address FROM postal_codes
        WHERE lat IS NULL AND code > $1
        ORDER BY code
        LIMIT 1000`,
      [cursor],
    );
    if (rows.length === 0) break;

    const codes: string[] = [];
    const lats: number[] = [];
    const lons: number[] = [];

    for (const row of rows) {
      cursor = row.code;
      const point =
        exact.get(row.address) ??
        base.get(row.address) ??
        city.get(row.address);
      if (!point) {
        missed++;
        continue;
      }
      if (exact.has(row.address)) hits.exact++;
      else if (base.has(row.address)) hits.base++;
      else hits.city++;

      codes.push(row.code);
      lats.push(point.lat);
      lons.push(point.lon);
    }

    if (codes.length > 0) {
      await pool.query(
        `UPDATE postal_codes AS p
            SET lat = v.lat, lon = v.lon, updated_at = now()
           FROM (SELECT unnest($1::text[]) AS code,
                        unnest($2::double precision[]) AS lat,
                        unnest($3::double precision[]) AS lon) AS v
          WHERE p.code = v.code`,
        [codes, lats, lons],
      );
      filled += codes.length;
    }
    console.log(`  埋めた ${filled} 件 / 当たらなかった ${missed} 件`);
  }

  console.log(
    `\n内訳: そのまま ${hits.exact} / 丁目落とし ${hits.base} / 市区町村 ${hits.city}`,
  );
  console.log(
    `当たらなかった ${missed} 件は、これまで通り POSTAL_STAGE=geocode が拾います。`,
  );
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    if (STAGE === "probe") {
      await stageProbe();
    } else if (STAGE === "fill") {
      await stageFill(pool);
      const { rows } = await pool.query<{ total: string; withCoords: string }>(
        `SELECT count(*)::text AS total,
                count(lat)::text AS "withCoords"
           FROM postal_codes`,
      );
      console.log(
        `\n現在: ${rows[0].total} 件（座標あり ${rows[0].withCoords} 件）`,
      );
    } else {
      throw new Error(`未知の段: ${STAGE}（probe / fill）`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
