/**
 * scripts/jis_city_codes.json を全国ぶん作り直す。
 *
 * この辞書は build_area_dataset.ts が「住所から市区町村を切り出す」ために使う。
 * 正規表現で切ると「四日市市」が「四日市」に、「神戸市西区」が「神戸市」に
 * なるので、正式名称と前方一致させて最も長く一致したものを採る作りになっている。
 *
 * ところが辞書は 12 県 441 件しか持っていなかった。スクレイパーは #100 と #108 で
 * 全国 47 都道府県に広がり、東京 35,083 件を含む 26 県ぶんの物件が DB に入って
 * いるのに、エリアページは 12 県 330 ページのまま増えなかった。原因はここ。
 * 辞書に無い市区町村は候補にすら入らない。
 *
 * 出典を 2 つ突き合わせて作る。片方だけでは足りないため。
 *
 *   コード … nojimage/local-gov-code-jp（総務省の全国地方公共団体コード）
 *            6 桁の検査数字付きなので先頭 5 桁を採る。郡を持たない。
 *   郡付きの表記 … geolonia/japanese-addresses
 *            住所に現れる形（「吉田郡永平寺町」）。コードを持たない。
 *
 * 既存の 441 件を 1 件も違えず再現できることを、実行時に必ず確かめる。
 * 再現できないなら出典か突き合わせ方が間違っているので、書き出さずに止める。
 *
 * 実行:
 *   npx tsx scripts/build_jis_city_codes.ts
 */
import * as fs from "fs";
import * as path from "path";

import { SCRAPE_TARGETS } from "../src/lib/scrapeTargets";

const CODE_SOURCE =
  "https://raw.githubusercontent.com/nojimage/local-gov-code-jp/master/index.json";
const NAME_SOURCE = "https://geolonia.github.io/japanese-addresses/api/ja.json";

interface GovRecord {
  type: "prefecture" | "city" | "ward";
  code: string;
  pref_name: string;
  city_name?: string;
  ward_name?: string;
}

interface Entry {
  code: string;
  name: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function main() {
  const [gov, names] = await Promise.all([
    getJson<GovRecord[]>(CODE_SOURCE),
    getJson<Record<string, string[]>>(NAME_SOURCE),
  ]);

  // 県名 → （郡を含まない名前 → 5 桁コード）
  const codesByPref = new Map<string, Map<string, string>>();
  for (const r of gov) {
    if (r.type === "prefecture") continue;
    const code = r.code.slice(0, 5);
    // 区は「名古屋市」＋「千種区」で住所の表記になる。
    const plain =
      r.type === "ward" ? `${r.city_name ?? ""}${r.ward_name ?? ""}` : r.city_name;
    if (!plain) continue;
    if (!codesByPref.has(r.pref_name)) codesByPref.set(r.pref_name, new Map());
    codesByPref.get(r.pref_name)!.set(plain, code);
  }

  const out: Record<string, Entry[]> = {};
  const problems: string[] = [];

  for (const target of SCRAPE_TARGETS) {
    const pref = target.name;
    const codes = codesByPref.get(pref);
    const addressNames = names[pref];
    if (!codes || !addressNames) {
      problems.push(`${pref}: 出典に無い（codes=${!!codes} names=${!!addressNames}）`);
      continue;
    }

    // 基準はコード側に置く。総務省のコードが正で、そこに載っている
    // 市区町村はすべて辞書に入れる。住所側を基準にすると、住所データの
    // 更新が遅れている自治体（2024 年に区を再編した浜松市など）が落ちる。
    //
    // 住所側は「郡」を足すためだけに使う。コード側は郡を持たないが、
    // DB の住所は「福井県吉田郡永平寺町…」なので、郡が無いと前方一致で
    // 1 件も拾えない。
    const entries: Entry[] = [];
    for (const [plain, code] of codes) {
      // 単純な後方一致だと「名古屋市」が「北名古屋市」に、
      // 「越前町」が「南条郡南越前町」に当たる。足してよいのは郡だけなので、
      // 前に付く部分が「郡」で終わることを条件にする。
      const withDistrict = addressNames.filter(
        (a) => a !== plain && a.endsWith(plain) && a.slice(0, -plain.length).endsWith("郡"),
      );
      if (withDistrict.length > 1) {
        problems.push(
          `${pref} ${plain}: 郡の候補が一意でない（${withDistrict.join(",")}）`,
        );
        continue;
      }
      entries.push({ code, name: withDistrict[0] ?? plain });
    }

    entries.sort((a, b) => a.code.localeCompare(b.code));
    out[target.slug] = entries;
  }

  // 受け入れ条件: 既存の 441 件を 1 件も違えず再現すること。
  const existingPath = path.join(process.cwd(), "scripts", "jis_city_codes.json");
  const existing = JSON.parse(
    fs.readFileSync(existingPath, "utf-8"),
  ) as Record<string, Entry[]>;

  let checked = 0;
  const regressions: string[] = [];
  for (const [slug, arr] of Object.entries(existing)) {
    const now = new Map((out[slug] ?? []).map((e) => [e.code, e.name]));
    for (const e of arr) {
      checked++;
      const got = now.get(e.code);
      if (got !== e.name) {
        regressions.push(`${slug} ${e.code}: 既存="${e.name}" 生成="${got ?? "無し"}"`);
      }
    }
  }

  console.log(`既存との照合: ${checked} 件中 ${checked - regressions.length} 件一致`);
  if (regressions.length > 0) {
    console.error("既存を再現できなかった:");
    for (const r of regressions.slice(0, 20)) console.error("  " + r);
    console.error(`  … 計 ${regressions.length} 件`);
    process.exit(1);
  }
  if (problems.length > 0) {
    console.error("突き合わせできなかった市区町村:");
    for (const p of problems.slice(0, 20)) console.error("  " + p);
    console.error(`  … 計 ${problems.length} 件`);
    process.exit(1);
  }

  const total = Object.values(out).reduce((a, b) => a + b.length, 0);
  fs.writeFileSync(existingPath, JSON.stringify(out, null, 2) + "\n");
  console.log(
    `書き出し: ${existingPath}（${Object.keys(out).length} 県 / ${total} 市区町村）`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
