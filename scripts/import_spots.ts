import { writeFileSync } from "node:fs";
import { MUNICIPALITY_POINTS } from "../src/lib/municipalityCoords";
import { distanceKmBetween } from "../src/utils/directionGeo";

/**
 * 一宮の一覧を Wikidata から取り込んで `src/data/powerSpots.json` に焼く。
 *
 * ## 取るものと、取らないもの
 *
 * 取るのは **名前・座標・指定** だけ。**所在地（P131）は取らない。**
 *
 * probe（run 33939209623）で実物を見たら、P131 は現代の自治体だけでは
 * なかった。
 *
 *     住吉神社 … 筑前国 / 那珂郡 / 住吉 / 住吉特別緑地保全地区
 *     枚岡神社 … 東大阪市 / 河内国 / 河内郡
 *     寒川神社 … 相模国 / 高座郡 / 寒川町
 *
 * 令制国も郡も緑地保全地区も混ざる。そのまま出せば
 * 「住吉神社（住吉特別緑地保全地区）」になる。
 *
 * **所在地は座標から手元のデータで引く**（municipalityCoords、1,894 件）。
 * サイトの他の表示と同じ母集団になり、令制国が出てくることもない。
 *
 * ## 同じ社に座標が 2 つあることがある
 *
 * 鹽竈神社は 38.31875 と 38.319119（約 40m 違い）、天津神社も同じ。
 * **決め方を固定しないと、実行のたびにピンが動く。**緯度・経度の
 * 文字列で並べて先頭を採る。どちらが正しいかは判断できないので、
 * **正しさではなく再現性で決める。**選ばなかったほうは `altCoords` に
 * 残して、差分を見た人が気付けるようにする。
 *
 * ## 件数の数え方
 *
 * probe は 302 行を返したが、実体は 108 社。P131 と P625 の複数値で
 * 行が膨らむ。**行数を件数と読み違えない。**ここでは QID で畳む。
 *
 * ## 出典
 *
 * Wikidata（CC0）。各件に QID を残すので、辿れる。
 *
 * ## 効果を書かない
 *
 * この表に入るのは「一宮という指定がある」という事実だけ。ご利益や
 * 効果は書かない（CLAUDE.md 4 節）。画面側も同じ。
 */

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const UA =
  "cloud-palette-spot-import/1.0 (https://cloud-palette.com; contact via site)";

/** 一宮（諸国一宮）。probe で実測した QID。 */
const ICHINOMIYA_QID = "Q1656379";
/** 一宮と社を結ぶプロパティ。**推測ではなく props で数えて出した**（108 件）。 */
const DESIGNATION_PROP = "P13723";

const OUT = "src/data/powerSpots.json";

interface Binding {
  [k: string]: { value: string } | undefined;
}

/** "Point(139.383612 35.37979)" → [lat, lon]。読めなければ null。 */
export function parsePoint(wkt: string): [number, number] | null {
  const m = wkt.match(/Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/);
  if (!m) return null;
  const lon = Number(m[1]);
  const lat = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  /* 日本の外に出る値は捨てる。取り違えの検出であって、判定ではない。 */
  if (lat < 20 || lat > 46 || lon < 122 || lon > 154) return null;
  return [lat, lon];
}

/** 最寄りの市区町村。座標から引く（Wikidata の P131 は使わない）。 */
function nearest(lat: number, lon: number) {
  let best = MUNICIPALITY_POINTS[0];
  let bestKm = Infinity;
  for (const m of MUNICIPALITY_POINTS) {
    const km = distanceKmBetween(lat, lon, m.lat, m.lon);
    if (km < bestKm) {
      bestKm = km;
      best = m;
    }
  }
  return { pref: best.pref, city: best.city, code: best.code, km: bestKm };
}

export interface PowerSpot {
  /** Wikidata の QID。出典を辿る鍵。 */
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** 座標から引いた最寄りの市区町村。**住所ではない。** */
  pref: string;
  city: string;
  code: string;
  /** なぜ載っているか。事実だけ。 */
  basis: string;
  /** 採らなかった座標。複数あった社だけ入る。 */
  altCoords?: [number, number][];
}

async function main() {
  const query = `
SELECT ?item ?itemLabel ?coord WHERE {
  ?item wdt:${DESIGNATION_PROP} wd:${ICHINOMIYA_QID}.
  ?item wdt:P625 ?coord.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ja". }
}`;

  const res = await fetch(SPARQL_ENDPOINT, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `query=${encodeURIComponent(query)}`,
  });
  if (!res.ok) {
    console.error(`SPARQL が HTTP ${res.status}`);
    console.error((await res.text()).slice(0, 500));
    process.exitCode = 1;
    return;
  }

  const body = (await res.json()) as {
    results?: { bindings?: Binding[] };
  };
  const rows = body.results?.bindings ?? [];
  console.log(`返ってきた行: ${rows.length}`);

  /* QID で畳む。行数は P625 の複数値で膨らむ（probe で 302 行／108 社）。 */
  const byId = new Map<string, { name: string; points: [number, number][] }>();
  for (const r of rows) {
    const uri = r.item?.value;
    const name = r.itemLabel?.value;
    const wkt = r.coord?.value;
    if (!uri || !name || !wkt) continue;
    const id = uri.split("/").pop()!;
    const pt = parsePoint(wkt);
    if (!pt) continue;
    const e = byId.get(id) ?? { name, points: [] };
    e.points.push(pt);
    byId.set(id, e);
  }
  console.log(`畳んだ社: ${byId.size}`);

  const spots: PowerSpot[] = [];
  let multi = 0;
  for (const [id, e] of byId) {
    /* 座標が複数あるときの決め方。**正しさではなく再現性で決める。**
       どちらが正しいかはここでは判断できない（鹽竈神社の 40m 差など）。 */
    const sorted = [...e.points].sort((a, b) =>
      `${a[0]},${a[1]}`.localeCompare(`${b[0]},${b[1]}`),
    );
    const [lat, lon] = sorted[0];
    if (sorted.length > 1) multi++;
    const n = nearest(lat, lon);
    spots.push({
      id,
      name: e.name,
      lat,
      lon,
      pref: n.pref,
      city: n.city,
      code: n.code,
      basis: "諸国一宮",
      ...(sorted.length > 1 ? { altCoords: sorted.slice(1) } : {}),
    });
  }

  /* 並びを固定する。Map の順は入力順で、上流の返り順に引きずられる。
   **並びが動くと差分がノイズだらけになり、中身の変化が読めない。** */
  spots.sort((a, b) => a.id.localeCompare(b.id));

  console.log(`座標が複数あった社: ${multi}`);
  console.log(`書き出す: ${spots.length} 件`);

  const out = {
    source: "Wikidata (CC0)",
    designation: { qid: ICHINOMIYA_QID, prop: DESIGNATION_PROP },
    note: "所在地は座標から最寄りの市区町村を引いたもので、住所ではない。効果や利益は含まない。",
    generatedAt: new Date().toISOString().slice(0, 10),
    spots,
  };
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.log(`書き出した: ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
