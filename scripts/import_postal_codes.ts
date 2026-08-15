import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";

/**
 * 郵便番号の対応表を作る。日本郵便のデータを取り込み、住所から座標を埋める。
 *
 * 2 段構えにしてある。**どちらも途中で止めて再開できる。**
 *
 *   1 段目  日本郵便の ken_all を取り込む（番号と住所）。座標は NULL
 *   2 段目  座標が NULL の行を国土地理院で引いて埋める
 *
 * 分けているのは、1 段目が数分で終わるのに対し、2 段目は公共の口を
 * 12 万回叩くことになるため。**同じ町丁目は 1 回しか引かない**（住所を
 * 鍵にして使い回す）ので実際の回数はずっと少ないが、それでも時間がかかる。
 * 1 段目さえ通れば「郵便番号 → 住所」は引けるので、画面は先に使える。
 *
 * 日本郵便のデータに座標は無い。取り込み時に引いて持つのは、画面を開く
 * たびに外へ出ないようにするため（scripts/geocode_properties.ts と同じ
 * 考え方で、提供元も国土地理院に揃える。同じ地名に違う座標を使わない）。
 *
 * 使い方:
 *   npx tsx scripts/import_postal_codes.ts            # 1 段目と 2 段目
 *   POSTAL_STAGE=fetch npx tsx scripts/...            # 1 段目だけ
 *   POSTAL_STAGE=geocode npx tsx scripts/...          # 2 段目だけ
 *
 * 環境変数
 *   POSTAL_TIME_BUDGET_MIN  2 段目の上限（分）。既定 0（無制限）
 *   POSTAL_SOURCE_URL       ken_all の zip の場所。渡せばそれだけを使う。
 *                           既定は日本郵便の候補を順に試す
 */

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set.");
}

/**
 * ken_all の置き場の候補。**上から順に試す。**
 *
 * 日本郵便は配布の場所をときどき変える。実際、こちらが最初に書いた
 * .../utf/zip/utf_ken_all.zip は 404 だった（2026-08-15 の実行）。
 * 1 つ決め打ちにすると、変わるたびにスクリプトごと落ちる。
 *
 * 落ちる代わりに、**どれが何を返したかを全部出してから終わる**。
 * 次に直すときに、推測ではなく実際の応答から決められる。
 *
 * POSTAL_SOURCE_URL を渡せば、その 1 つだけを使う。
 */
const SOURCE_CANDIDATES = process.env.POSTAL_SOURCE_URL
  ? [process.env.POSTAL_SOURCE_URL]
  : [
      // UTF-8 版（住所が UTF-8。こちらが第一希望）
      "https://www.post.japanpost.jp/zipcode/dl/utf/zip/utf_ken_all.zip",
      "https://www.post.japanpost.jp/zipcode/dl/utf/utf_ken_all.zip",
      // 小書き版（Shift-JIS）。UTF-8 が取れないときの受け皿
      "https://www.post.japanpost.jp/zipcode/dl/kogaki/zip/ken_all.zip",
      "https://www.post.japanpost.jp/zipcode/dl/oogaki/zip/ken_all.zip",
    ];

/**
 * 素の fetch は User-Agent を送らない。配布側が UA の無い要求に 404 を
 * 返すことがあるので、ふつうの閲覧と同じ形にしておく。
 */
const UA =
  "Mozilla/5.0 (compatible; cloud-palette/1.0; +https://cloud-palette.com)";

const GSI_ENDPOINT = "https://msearch.gsi.go.jp/address-search/AddressSearch";

const TIME_BUDGET_MS =
  (parseInt(process.env.POSTAL_TIME_BUDGET_MIN || "0", 10) || 0) * 60_000;
const STARTED_AT = Date.now();

const STAGE = process.env.POSTAL_STAGE || "all";

function budgetReached(): boolean {
  return TIME_BUDGET_MS > 0 && Date.now() - STARTED_AT >= TIME_BUDGET_MS;
}

/**
 * ken_all の 1 行から、番号と住所を作る。
 *
 * 列は「全国地方公共団体コード, 旧番号, 郵便番号, カナ×3, 都道府県, 市区町村,
 * 町域, ...」の順。使うのは 3 列目と 7〜9 列目だけ。
 *
 * 町域には案内文が混ざる。「以下に掲載がない場合」「○○の次に番地がくる場合」
 * のような行は町域名ではないので落とす。残すと「京都府京都市以下に掲載が
 * ない場合」という住所ができ、座標を引いたときに別の場所に当たる。
 */
function parseLine(line: string): { code: string; address: string } | null {
  const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
  if (cols.length < 9) return null;

  const code = cols[2];
  if (!/^\d{7}$/.test(code)) return null;

  const pref = cols[6];
  const city = cols[7];
  let town = cols[8];

  /*
    括弧を先に外してから案内文を判定する。順序が逆だと
    「千代田（次に番地がくる場合）」の町名まで落ちてしまい、
    東京都千代田区千代田 が 東京都千代田区 になる。
    括弧の中は但し書き（「（丁目）」「（○○番地）」など）で地名ではない。
  */
  town = town.replace(/（.*$/, "").replace(/\(.*$/, "");

  // 括弧を外しても案内文だけが残る行がある。町域名として使えない。
  if (
    town.includes("以下に掲載がない場合") ||
    town.includes("次に番地がくる場合") ||
    town === "一円"
  ) {
    town = "";
  }

  const address = `${pref}${city}${town}`;
  if (!address) return null;

  return { code, address };
}

/** zip の中の 1 ファイルを取り出す。ken_all は常に 1 ファイル。 */
function unzipSingleFile(buf: Buffer): string {
  // ローカルファイルヘッダを読む。ken_all は deflate 1 本なので、
  // 汎用の zip 実装を持ち込まずに済む。
  if (buf.readUInt32LE(0) !== 0x04034b50) {
    throw new Error("zip の形が想定と違います");
  }
  const method = buf.readUInt16LE(8);
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const start = 30 + nameLen + extraLen;

  // 中央ディレクトリの手前までが本体。
  const sigIndex = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), start);
  const end = sigIndex > 0 ? sigIndex : buf.length;
  const body = buf.subarray(start, end);

  if (method === 0) return body.toString("utf8");
  if (method === 8) return zlib.inflateRawSync(body).toString("utf8");
  throw new Error(`未対応の圧縮方式: ${method}`);
}

/**
 * 候補を順に試して、最初に取れたものを返す。
 *
 * 全部駄目なら、**どれが何を返したかを並べて**投げる。次に直す人が
 * 推測しなくて済むようにするため。
 */
async function downloadKenAll(): Promise<{ url: string; buf: Buffer }> {
  const tried: string[] = [];

  for (const url of SOURCE_CANDIDATES) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "*/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) {
        tried.push(`${res.status} ${url}`);
        console.log(`  × ${res.status} ${url}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      // 中身が zip か確かめる。案内ページの HTML が 200 で返ることがある。
      if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) {
        tried.push(`zip ではない (${buf.length} bytes) ${url}`);
        console.log(`  × zip ではない (${buf.length} bytes) ${url}`);
        continue;
      }
      console.log(`  ○ ${url}`);
      return { url, buf };
    } catch (e) {
      tried.push(`${String(e).slice(0, 60)} ${url}`);
      console.log(`  × ${String(e).slice(0, 60)} ${url}`);
    }
  }

  throw new Error(
    "ken_all を取得できませんでした。試した先:\n  " +
      tried.join("\n  ") +
      "\n\n日本郵便の配布ページで現在の URL を確認し、" +
      "POSTAL_SOURCE_URL に渡して再実行してください。",
  );
}

async function stageFetch(pool: Pool) {
  console.log("日本郵便のデータを取得します。候補を順に試します:");
  const { url, buf } = await downloadKenAll();
  console.log(`  ${(buf.length / 1024 / 1024).toFixed(1)} MB（${url}）`);

  const text = unzipSingleFile(buf);
  const lines = text.split(/\r?\n/).filter(Boolean);
  console.log(`  ${lines.length} 行`);

  /*
    同じ郵便番号が複数行に分かれていることがある（町域が長くて折り返す
    ケース）。最初の 1 行だけ使う。番号から住所を引くのが目的なので、
    町域の続きまで繋ぐ必要はない。
  */
  const byCode = new Map<string, string>();
  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    if (!byCode.has(parsed.code)) byCode.set(parsed.code, parsed.address);
  }
  console.log(`  郵便番号 ${byCode.size} 件`);

  const entries = [...byCode.entries()];
  const CHUNK = 2000;
  let done = 0;

  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    /*
      住所が変わったときだけ書き換え、座標は触らない。触ると 2 段目の
      成果が毎回消えて、いつまでも終わらない。
    */
    await pool.query(
      `INSERT INTO postal_codes (code, address)
       SELECT unnest($1::char(7)[]), unnest($2::text[])
       ON CONFLICT (code) DO UPDATE
         SET address = EXCLUDED.address, updated_at = now()
       WHERE postal_codes.address IS DISTINCT FROM EXCLUDED.address`,
      [chunk.map((c) => c[0]), chunk.map((c) => c[1])],
    );
    done += chunk.length;
    if (done % 20000 === 0)
      console.log(`  取り込み ${done} / ${entries.length}`);
  }
  console.log(`✅ 1 段目 完了（${entries.length} 件）`);
}

async function lookupGsi(
  query: string,
): Promise<{ lat: number; lon: number } | null> {
  try {
    const res = await fetch(`${GSI_ENDPOINT}?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{
      geometry?: { coordinates?: [number, number] };
    }>;
    const coords = json?.[0]?.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;
    // GeoJSON は [経度, 緯度] の順。
    const [lon, lat] = coords;
    if (typeof lat !== "number" || typeof lon !== "number") return null;
    return { lat, lon };
  } catch {
    return null;
  }
}

async function stageGeocode(pool: Pool) {
  // 住所ごとに 1 回だけ引く。同じ町丁目に複数の番号が付くため。
  const cache = new Map<string, { lat: number; lon: number } | null>();
  let calls = 0;
  let filled = 0;
  /*
    code のカーソルで前へ進める。「座標が無い行」を毎回先頭から取り直すと、
    引けなかった行が先頭に居座って同じ 500 件を延々と読み直す（前に進まない）。
    scripts/geocode_properties.ts が同じ理由で同じ形にしてある。
    取りこぼしは次回の実行が拾う。
  */
  let cursor = "0000000";

  while (true) {
    if (budgetReached()) {
      console.log("⏱️ 時間の上限に達しました。続きは次回に回します。");
      break;
    }

    const { rows } = await pool.query<{ code: string; address: string }>(
      `SELECT code, address FROM postal_codes
        WHERE lat IS NULL AND code > $1
        ORDER BY code
        LIMIT 500`,
      [cursor],
    );
    if (rows.length === 0) {
      console.log("🎉 この回で見る範囲の空きは埋め終わりました。");
      break;
    }

    for (const row of rows) {
      if (budgetReached()) break;
      cursor = row.code;

      let point = cache.get(row.address);
      if (point === undefined) {
        point = await lookupGsi(row.address);
        cache.set(row.address, point);
        calls++;
        // 公共の口なので間隔を空ける。キャッシュに当たったら待たない。
        await new Promise((r) => setTimeout(r, 200));
      }

      if (point) {
        await pool.query(
          `UPDATE postal_codes SET lat = $2, lon = $3, updated_at = now()
            WHERE code = $1`,
          [row.code, point.lat, point.lon],
        );
        filled++;
      } else {
        /*
          引けなかった番号を NULL のままにすると、次の周回で同じ行を
          また読んで前に進まない。座標が出ない目印として 0 は入れられない
          （0,0 は大西洋上の実在の点で、方位が出てしまう）ので、
          住所の末尾を削って市区町村まででもう一度だけ試す。
        */
        const fallback = row.address.replace(/[^都道府県市区町村]+$/, "");
        const coarse =
          fallback && fallback !== row.address
            ? await lookupGsi(fallback)
            : null;
        calls++;
        await new Promise((r) => setTimeout(r, 200));

        if (coarse) {
          await pool.query(
            `UPDATE postal_codes SET lat = $2, lon = $3, updated_at = now()
              WHERE code = $1`,
            [row.code, coarse.lat, coarse.lon],
          );
          filled++;
        } else {
          // それでも出ない。lat は NULL のままにして次回の実行に回す。
          // カーソルが進むので、この回で足止めされることはない。
          console.log(`  座標を引けません: ${row.code} ${row.address}`);
        }
      }
    }

    console.log(`  埋めた ${filled} 件 / 問い合わせ ${calls} 回`);
  }
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    if (STAGE === "all" || STAGE === "fetch") await stageFetch(pool);
    if (STAGE === "all" || STAGE === "geocode") await stageGeocode(pool);

    const { rows } = await pool.query<{ total: string; located: string }>(
      `SELECT count(*)::text AS total, count(lat)::text AS located
         FROM postal_codes`,
    );
    console.log(
      `\n現在: ${rows[0].total} 件（座標あり ${rows[0].located} 件）`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
