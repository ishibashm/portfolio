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

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

const PREF_JP: Record<string, string> = {
  aichi: "愛知県",
  shizuoka: "静岡県",
  mie: "三重県",
  fukui: "福井県",
  shiga: "滋賀県",
  kyoto: "京都府",
  osaka: "大阪府",
  nara: "奈良県",
  hyogo: "兵庫県",
  tottori: "鳥取県",
  shimane: "島根県",
  hiroshima: "広島県",
};

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
  const candidates: Array<{ code: string; pref: string; city: string; full: string }> =
    [];
  for (const [slug, cities] of Object.entries(jis)) {
    const pref = PREF_JP[slug];
    if (!pref) continue;
    for (const c of cities) {
      if (c.code.endsWith("00")) continue;
      candidates.push({ code: c.code, pref, city: c.name, full: pref + c.name });
    }
  }
  // 長い名前を先に判定する（名古屋市中区 が 名古屋市 に食われないように）
  candidates.sort((a, b) => b.full.length - a.full.length);
  console.log(`候補の市区町村: ${candidates.length}`);

  const areas: Area[] = [];
  for (const c of candidates) {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n,
              avg(lat) AS lat, avg(lon) AS lon,
              avg((rent + coalesce(management_fee,0))::numeric / size_sqm) AS sqm_rent,
              percentile_cont(0.5) WITHIN GROUP (
                ORDER BY rent + coalesce(management_fee,0)) AS median_rent
         FROM rental_properties
        WHERE address LIKE $1 || '%'
          AND lat IS NOT NULL AND lon IS NOT NULL
          AND rent IS NOT NULL AND size_sqm > 0
          AND last_seen_at > now() - interval '30 days'
          AND (expire_date IS NULL OR expire_date >= now())`,
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

  console.log(`書き出し: ${outPath}`);
  console.log(`市区町村: ${filtered.length} 件`);
  console.table(filtered.slice(0, 10));
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
