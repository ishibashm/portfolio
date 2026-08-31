/**
 * 全国の市区町村の代表点（`src/data/municipalityCoords.json`）を作る。
 *
 * ## なぜ要るか
 *
 * `areaDirections.json` の母集団は**賃貸の掲載を集計できた市区町村**で、
 * 全国 1,917 のうち 1,119 しかない（2026-08-31 実測）。そのため
 * `emptyDirections` は「その方位に候補が無い」までしか答えられず、
 * **海や山で本当に行き止まりなのか、掲載が無いだけなのかを区別できな
 * かった。**その区別ができないまま「行き止まり」と書いていたのが
 * #832〜#834 で直した不具合で、実際に外れていた。
 *
 *     長崎市の西「東シナ海で行き止まり」  … 五島市・新上五島町がある
 *     福岡市中央区の北西「玄界灘」        … 壱岐市・対馬市がある
 *     釧路町の東「太平洋」                … 厚岸町・浜中町・根室市がある
 *
 * この表があれば、掲載の有無と無関係に「その方位に市区町村があるか」を
 * 計算できる。
 *
 * ## 出典と作り方
 *
 * geolonia/japanese-addresses の `data/latest.csv`（大字・町丁目ごとの
 * 緯度経度）。**リポジトリで既に使っている出典**で、
 * `scripts/update_municipalities_coords.ts` が同じ CSV を引いている。
 *
 * 市区町村コードごとに、その中の全地点の**単純平均**を代表点とする。
 * 上の既存スクリプトは「最初に出会った 1 点」を採っているが、それだと
 * 市の端の町名が代表点になり得るので、ここでは平均を採る。
 *
 * ## areaDirections.json の座標とは作り方が違う
 *
 * あちらは**掲載のある物件の緯度経度の平均**（build_area_dataset の
 * `avg(lat)`）で、住宅の多い側に寄る。こちらは町丁目の平均で、市域の
 * 真ん中に寄る。**同じ市区町村でも数 km ずれる。**方位の判定は
 * areaDirections の側を出発地に使い続けるので、この表は
 * **「その方位に市区町村があるか」を見るためだけに使う。**
 *
 * ## 使い方
 *
 *     curl -sS -o /tmp/latest.csv \
 *       https://raw.githubusercontent.com/geolonia/japanese-addresses/master/data/latest.csv
 *     npx tsx scripts/build_municipality_coords.ts /tmp/latest.csv
 *
 * CSV は 50MB あるので取り込まない。生成した JSON だけをコミットする。
 * 出力は prettier の形（2 スペース）で書く。lefthook の pre-commit が
 * 新しいファイルの整形を見るので、1 行で書くと弾かれる。
 */
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

interface Acc {
  pref: string;
  city: string;
  latSum: number;
  lonSum: number;
  n: number;
}

/** 列の位置。CSV の見出し行と突き合わせて確かめてある。 */
const COL = { pref: 1, code: 4, city: 5, lat: 12, lon: 13 } as const;

/** 引用符つき CSV の 1 行を割る。住所に読点が入るため split(",") では割れない。 */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error(
      "使い方: npx tsx scripts/build_municipality_coords.ts <latest.csv>",
    );
    process.exit(1);
  }

  const byCode = new Map<string, Acc>();
  const rl = createInterface({
    input: createReadStream(csvPath),
    crlfDelay: Infinity,
  });
  let header = true;
  let rows = 0;
  for await (const line of rl) {
    if (header) {
      header = false;
      continue;
    }
    if (!line) continue;
    const c = splitCsv(line);
    if (c.length <= COL.lon) continue;
    const code = c[COL.code];
    const lat = Number(c[COL.lat]);
    const lon = Number(c[COL.lon]);
    /* 緯度経度が空の行がある。Number("") は 0 で、Number.isFinite(0) は
       true なので、素通しすると**赤道・グリニッジの点を平均に混ぜる。**
       篠栗町の代表点がインド洋（19.2, 74.6）になっていた。日本の範囲に
       入っているかで弾く。 */
    if (
      !/^\d{5}$/.test(code) ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < 20 ||
      lat > 46 ||
      lon < 122 ||
      lon > 154
    ) {
      continue;
    }
    rows++;
    const acc = byCode.get(code);
    if (acc) {
      acc.latSum += lat;
      acc.lonSum += lon;
      acc.n++;
    } else {
      byCode.set(code, {
        pref: c[COL.pref],
        city: c[COL.city],
        latSum: lat,
        lonSum: lon,
        n: 1,
      });
    }
  }

  const areas = [...byCode.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([code, a]) => ({
      code,
      pref: a.pref,
      city: a.city,
      lat: Number((a.latSum / a.n).toFixed(5)),
      lon: Number((a.lonSum / a.n).toFixed(5)),
    }));

  const out = {
    generatedAt: new Date().toISOString(),
    source:
      "geolonia/japanese-addresses data/latest.csv（市区町村コードごとに大字・町丁目の緯度経度を平均）",
    areas,
  };
  writeFileSync(
    "src/data/municipalityCoords.json",
    JSON.stringify(out, null, 2) + "\n",
  );
  console.log(`地点 ${rows.toLocaleString()} 行 → 市区町村 ${areas.length} 件`);
}

main();
