/**
 * 夜間の集計で数字が動いた頁だけを IndexNow へ知らせる。
 *
 * IndexNow は「この URL が変わった」を検索エンジンへ直接知らせる仕組み
 * （Bing・Yandex・Seznam・Naver。**Google は参加していない**）。市区町村と
 * 県の相場は毎晩動くが、クロールされるまで更新が伝わらない。
 *
 * ## 変わった頁だけを送る
 *
 * 毎晩 1,000 頁を送ると、中身がほとんど変わっていない頁まで送ることになり、
 * 無視されるか悪印象になる。前回のコミット（`git show HEAD:`）と作り直した
 * 集計を市区町村ごとに比べ、**掲載件数・座標・相場のどれかが動いた頁**だけ
 * を送る。`asOf` と `generatedAt` は毎晩変わるので見ない。
 *
 * ## 索引に載せている頁だけを送る
 *
 * 市区町村ページは文章を書いた頁（AREA_EDITORIAL）だけ index で、残りは
 * noindex（#379・#750〜）。noindex の URL を送っても意味が無いので出さない。
 * 県ページは 47 県すべて index。
 *
 * ## 既定は dry-run
 *
 *   npx -y tsx scripts/submit_indexnow.ts                 # 送る候補を出すだけ
 *   npx -y tsx scripts/submit_indexnow.ts --apply         # 実際に送る
 *   npx -y tsx scripts/submit_indexnow.ts --base HEAD~1   # 比べる相手を変える
 *
 * 夜間の巡回では**集計をコミットして push した後**に `--base HEAD~1` で
 * 走らせる。push の前に送ると、検索エンジンが古い頁を読みに来る。
 * コミットしなかった晩（変化なし）は走らせない（HEAD~1 が別の変更に
 * なり、動いていない頁を送ってしまう）。
 *
 * 鍵は INDEXNOW_KEY（Cloud Run と同じ値。鍵ファイルは /indexnow-key.txt）。
 * 未設定なら候補を出して終わる。夜間の巡回を道連れにしないため、送信の
 * 失敗以外では落ちない。
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { AREA_EDITORIAL } from "../src/lib/areaEditorial";
import { PREF_EDITORIAL } from "../src/lib/prefEditorial";

const SITE = process.env.SITE_URL ?? "https://cloud-palette.com";
const KEY_LOCATION = `${SITE}/indexnow-key.txt`;
const ENDPOINT = "https://api.indexnow.org/indexnow";
const DATASET = "src/data/areaDirections.json";

interface Area {
  code: string;
  lat: number;
  lon: number;
  count: number;
  sqmRent: number | null;
  medianRent: number | null;
}
interface Dataset {
  areas: Area[];
}

/** 比べる値だけを 1 本の文字列にする。asOf は入れない。 */
function fingerprint(a: Area): string {
  return [a.lat, a.lon, a.count, a.sqmRent, a.medianRent].join("|");
}

/** 前回と今回で値が動いた市区町村コード。新しく現れたものも含む。 */
export function changedCodes(prev: Dataset, next: Dataset): string[] {
  const before = new Map(prev.areas.map((a) => [a.code, fingerprint(a)]));
  const out: string[] = [];
  for (const a of next.areas) {
    if (before.get(a.code) !== fingerprint(a)) out.push(a.code);
  }
  return out;
}

/** 送る URL。索引に載せている頁だけ。県は市区町村から起こす。 */
export function urlsFor(codes: readonly string[]): string[] {
  const urls = new Set<string>();
  for (const code of codes) {
    if (AREA_EDITORIAL[code]) urls.add(`${SITE}/houi/area/${code}`);
    const pref = code.slice(0, 2);
    if (PREF_EDITORIAL[pref]) urls.add(`${SITE}/houi/pref/${pref}`);
  }
  return [...urls].sort();
}

function loadPrevious(base: string): Dataset | null {
  try {
    return JSON.parse(
      execFileSync("git", ["show", `${base}:${DATASET}`], {
        encoding: "utf-8",
      }),
    ) as Dataset;
  } catch {
    return null;
  }
}

/** `--base HEAD~1` の値。無ければ HEAD（作業ツリーと直前のコミットを比べる）。 */
function baseRef(argv: readonly string[]): string {
  const i = argv.indexOf("--base");
  return i >= 0 && argv[i + 1] ? argv[i + 1] : "HEAD";
}

async function main() {
  const apply = process.argv.includes("--apply");
  const next = JSON.parse(readFileSync(DATASET, "utf-8")) as Dataset;
  const base = baseRef(process.argv);
  const prev = loadPrevious(base);
  if (!prev) {
    console.log(`${base} の集計が読めない（初回か、git の外）。送らない。`);
    return;
  }
  console.log(`比べる相手: ${base}`);

  const codes = changedCodes(prev, next);
  const urls = urlsFor(codes);
  console.log(
    `動いた市区町村 ${codes.length} / ${next.areas.length}、送る URL ${urls.length}（index の頁だけ）`,
  );
  for (const u of urls) console.log("  " + u);

  if (urls.length === 0) {
    console.log("送るものが無い。");
    return;
  }
  const key = process.env.INDEXNOW_KEY?.trim();
  if (!key) {
    console.log("INDEXNOW_KEY が未設定。候補だけ出して終わる。");
    return;
  }
  if (!apply) {
    console.log("dry-run。--apply で送る。");
    return;
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: new URL(SITE).host,
      key,
      keyLocation: KEY_LOCATION,
      urlList: urls,
    }),
  });
  /* 200 と 202 が受理。それ以外は理由ごと残す（鍵の不一致は 403） */
  console.log(`IndexNow: HTTP ${res.status}`);
  if (res.status !== 200 && res.status !== 202) {
    console.error(await res.text());
    process.exitCode = 1;
  }
}

/* 検査から import したときは走らせない */
if (process.argv[1]?.endsWith("submit_indexnow.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
