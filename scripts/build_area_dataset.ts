/**
 * 市区町村ごとの「中心座標・物件数・㎡単価」を集計して JSON に書き出す。
 *
 * これを使って「A市から見て北西にはどんな街があり、相場はいくらか」という
 * ページを静的生成する。方位は出発地から決まるので、市区町村どうしの
 * 位置関係は固定であり、静的ページとして成立する。
 *
 * ビルド時に DB を引くとページ数ぶんクエリが走るので、ここで一度だけ集計して
 * src/data/areaDirections.json に置く。相場は日ごとに大きくは動かないため、
 * スクレイパーのワークフローから定期的に叩き直せばよい。
 *
 * 住所から市区町村を切り出すのに正規表現を使うと「四日市市」が「四日市」に、
 * 「神戸市西区」が「神戸市」になる。scripts/jis_city_codes.json の
 * 正式名称と前方一致させ、最も長く一致したものを採用する。
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

import { PREF_JP } from "../src/lib/scrapeTargets";
import { LIVE_LISTING_SQL } from "../src/lib/rentalListingSql";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

// 掲載が少ない市区町村は相場の平均が当てにならないので落とす
const MIN_ROWS = 30;

interface Area {
  code: string;
  pref: string;
  city: string;
  full: string;
  lat: number;
  lon: number;
  count: number;
  sqmRent: number;
  medianRent: number;
}

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const pool = new Pool({ connectionString, max: 1 });

  const jis = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "scripts", "jis_city_codes.json"),
      "utf-8",
    ),
  ) as Record<string, Array<{ code: string; name: string }>>;

  // 政令市の親エントリ（末尾00）は区が別にあるので除く
  const candidates: Array<{
    code: string;
    pref: string;
    city: string;
    full: string;
  }> = [];
  for (const [slug, cities] of Object.entries(jis)) {
    const pref = PREF_JP[slug];
    if (!pref) continue;
    for (const c of cities) {
      if (c.code.endsWith("00")) continue;
      candidates.push({
        code: c.code,
        pref,
        city: c.name,
        full: pref + c.name,
      });
    }
  }
  // 長い名前を先に判定する（名古屋市中区 が 名古屋市 に食われないように）
  candidates.sort((a, b) => b.full.length - a.full.length);
  console.log(`候補の市区町村: ${candidates.length}`);

  // 県ごとの掲載数。地図の俯瞰（県別の色分けと件数ラベル）が使う。
  //
  // 市区町村より先に数えるのは、掲載が 1 件も無い県の市区町村を
  // 問い合わせないため。辞書を 12 県 441 件から 47 県 1,917 件に広げた結果、
  // 素直に回すと問い合わせが 4 倍になる。県の合計が MIN_ROWS に満たなければ、
  // その県のどの市区町村も MIN_ROWS を超えない。まとめて飛ばせる。
  //
  // 市区町村の集計から合算しないのは、掲載 30 件未満の市区町村が
  // MIN_ROWS で落ちていて合計が実態より減るため。県単位で数え直す。
  const prefTotals: Record<string, number> = {};
  for (const prefName of Object.values(PREF_JP)) {
    // 条件は lib/rentalListingSql から引く。/api/rentals/arbitrage/
    // prefecture-counts（絞り込み後の件数）と同じものを見ないと、
    // 絞り込みを何も掛けていないのに数字が違う、という形で出る。
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n
         FROM rental_properties
        WHERE address LIKE $1 || '%'
          AND ${LIVE_LISTING_SQL}`,
      [prefName],
    );
    const n = rows[0]?.n ?? 0;
    if (n > 0) prefTotals[prefName] = n;
  }

  const prefsWorthScanning = new Set(
    Object.entries(prefTotals)
      .filter(([, n]) => n >= MIN_ROWS)
      .map(([name]) => name),
  );
  const scannable = candidates.filter((c) => prefsWorthScanning.has(c.pref));
  console.log(
    `掲載のある県: ${prefsWorthScanning.size} / 問い合わせる市区町村: ${scannable.length}`,
  );

  const areas: Area[] = [];
  for (const c of scannable) {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n,
              avg(lat) AS lat, avg(lon) AS lon,
              avg((rent + coalesce(management_fee,0))::numeric / size_sqm) AS sqm_rent,
              percentile_cont(0.5) WITHIN GROUP (
                ORDER BY rent + coalesce(management_fee,0)) AS median_rent
         FROM rental_properties
        WHERE address LIKE $1 || '%'
          AND ${LIVE_LISTING_SQL}`,
      [c.full],
    );
    const r = rows[0];
    if (!r || r.n < MIN_ROWS) continue;
    areas.push({
      code: c.code,
      pref: c.pref,
      city: c.city,
      full: c.full,
      lat: Number(Number(r.lat).toFixed(5)),
      lon: Number(Number(r.lon).toFixed(5)),
      count: r.n,
      sqmRent: Math.round(Number(r.sqm_rent)),
      medianRent: Math.round(Number(r.median_rent)),
    });
  }

  // 前方一致なので「名古屋市」と「名古屋市中区」の両方が拾われる。
  // 区がある市は区だけを残し、親の市は落とす。
  const hasWard = new Set<string>();
  for (const a of areas) {
    const m = a.city.match(/^(.+?市)(.+区)$/);
    if (m) hasWard.add(a.pref + m[1]);
  }
  const filtered = areas.filter((a) => !hasWard.has(a.full));

  filtered.sort((a, b) => b.count - a.count);
  const outDir = path.join(process.cwd(), "src", "data");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "areaDirections.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), areas: filtered },
      null,
      2,
    ),
  );

  // prefTotals は市区町村より先に数えてある（掲載の無い県を飛ばすため）。
  // 以前の俯瞰は「API が返した安い順 500 件」を県名で数えて塗っていた。
  // 母数が 500 件では安い県だけが濃く出るし、その 500 件を出すために
  // 全国 45 万行の名寄せ（実測 18.4 秒）を走らせていた。俯瞰に必要なのは
  // 県ごとの数字だけなので、毎晩数えて静的に配る。

  // スキャナーの県プリセット用。areaDirections.json は 78KB あり、
  // client コンポーネントに読ませるとそのままバンドルに乗る。県名だけの
  // 小さな配列を別に吐いて、UI はこちらを読む。
  //
  // 対象県に足したばかりでまだ物件を取り切れていない県を、プリセットに
  // 出しても 0 件になるだけなので、実際にデータが載った県だけを並べる。
  //
  // generatedAt は入れない。入れると毎晩必ず差分が出て、県の集合が変わって
  // いないのにコミットが積まれる。県が増減したときだけ動く形にしておく。
  const prefsWithData = [...new Set(filtered.map((a) => a.pref))].sort();
  const prefsPath = path.join(outDir, "prefecturesWithData.json");
  fs.writeFileSync(
    prefsPath,
    JSON.stringify(
      {
        prefs: prefsWithData,
        areaCount: filtered.length,
        // 県名 → 掲載数。地図の俯瞰の色分けと件数ラベルの元。
        listingCounts: prefTotals,
      },
      null,
      2,
    ) + "\n",
  );

  console.log(`書き出し: ${outPath}`);
  console.log(`書き出し: ${prefsPath}（${prefsWithData.length} 県）`);
  console.log(`市区町村: ${filtered.length} 件`);
  console.table(filtered.slice(0, 10));
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
