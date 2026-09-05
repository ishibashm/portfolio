/**
 * 国土数値情報の一括ファイル（既定は「用途地域」A29。`--dataset N02` で
 * 鉄道）が、どの年版で・どの大きさで配られているかを見る。
 * **ダウンロードはしない。**
 *
 * ## なぜ
 *
 * 利用者の要望「用途地域を全国の俯瞰でも見たい」。タイル API
 * （XKT002）は z11 までしか受け付けないことが実測で確定した
 * （run 33946832674。z5〜10 は HTTP 400「不正なズーム値」）。俯瞰の
 * 1 画面 = z11 の数千枚なので、タイル API からは組めない。
 *
 * 一括ファイル（県ごとの zip）が取れるなら、**一度だけ取って手元で
 * z5〜10 の絵に焼く**道が開く。上流に毎回の負荷を掛けずに済む。
 * その前に、実際に何があるかを見る。
 *
 * ## 何を見るか
 *
 * 1. 一覧ページ（datalist）から A29 の zip の URL を全部拾う
 *    （年版と県の組み合わせ。ページは 1 回だけ取る）
 * 2. 年版ごとに 3 県（北海道・東京・大阪）だけ HEAD して Content-Length
 *    を出す。全 47 県は要らない。大きさの桁が分かれば十分
 * 3. 利用規約の URL を出す。取り込む前に人が読む
 *
 * 要求は 1 + 3 × 年版の数（数回〜十数回）。1 秒間隔。
 */

/**
 * どのデータを見るか。`--dataset N02` のように指定する。既定は A29。
 *
 *   A29 … 用途地域（県ごとの zip。実測済み: 2 年版・47 県）
 *   N02 … 鉄道（路線・駅。全国 1 本の zip の見込み）。駅・路線の層の
 *         入手経路として。「駅・路線は最後に、測ってから」（利用者の
 *         要望の順）
 *
 * 一覧ページは版番号なしの `KsjTmplt-<id>.html`（A29 の版付きページから
 * `../datalist/KsjTmplt-A29.html` へのリンクがあった）。無ければ A29 で
 * 実測した版付きに落ちる。
 */
const DATASET = (() => {
  const i = process.argv.indexOf("--dataset");
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v && /^[A-Z][0-9]{2}$/.test(v) ? v : "A29";
})();
const DATALIST_CANDIDATES = [
  `https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-${DATASET}.html`,
  ...(DATASET === "A29"
    ? ["https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A29-v2_1.html"]
    : []),
];
const TERMS = "https://nlftp.mlit.go.jp/ksj/other/agreement.html";
const SAMPLE_PREFS = ["01", "13", "27"];
/** 県分けでない（全国 1 本）年版で HEAD する上限。 */
const MAX_NATIONAL_HEADS = 4;
const WAIT_MS = 1000;
const wait = () => new Promise((r) => setTimeout(r, WAIT_MS));
const UA =
  "cloud-palette-ksj-probe/1.0 (https://cloud-palette.com; contact via site)";

async function head(
  url: string,
): Promise<{ status: number; bytes: number | null; type: string }> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": UA },
      redirect: "follow",
    });
    const len = res.headers.get("content-length");
    return {
      status: res.status,
      bytes: len === null ? null : Number(len),
      type: res.headers.get("content-type") ?? "",
    };
  } catch (err) {
    return { status: 0, bytes: null, type: String(err) };
  }
}

async function main() {
  console.log(`## 1. 一覧ページにある ${DATASET} の zip\n`);
  let html = "";
  let DATALIST = "";
  for (const url of DATALIST_CANDIDATES) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    console.log(`datalist: ${url} → HTTP ${res.status}`);
    if (res.ok) {
      html = await res.text();
      DATALIST = url;
      break;
    }
    await wait();
  }
  if (!DATALIST) {
    console.log("一覧が取れない。ここで終わる（推測で URL を組まない）。");
    return;
  }
  /* リンクは datalist からの相対パス（../data/A29/A29-19/A29-19_13_GML.zip）。
     1 回目（run 33947688471）は絶対パスだけを探して 0 本だった
     （run 33948048061 で中身を出して分かった。年版は A29-11 と A29-19）。
     絶対に直して持つ。 */
  const urls = new Set<string>();
  const zipRe = new RegExp(
    `(?:\\.\\./|/ksj/gml/)(data/${DATASET}/[^'"\\s<>]+\\.zip)`,
    "g",
  );
  for (const m of html.matchAll(zipRe)) {
    urls.add(`/ksj/gml/${m[1]}`);
  }
  /** 年版（A29-19 など）→ 県コード（全国 1 本なら "all"）→ URL */
  const byVersion = new Map<string, Map<string, string>>();
  const verRe = new RegExp(
    `/(${DATASET}-[0-9]+[a-z]?)/[^/]*?(?:_([0-9]{2}))?_GML\\.zip$`,
  );
  for (const u of urls) {
    const m = u.match(verRe);
    if (!m) continue;
    const ver = m[1];
    const pref = m[2] ?? "all";
    const set = byVersion.get(ver) ?? new Map<string, string>();
    set.set(pref, u);
    byVersion.set(ver, set);
  }
  console.log(`zip の URL: ${urls.size} 本、年版: ${byVersion.size}`);
  if (urls.size === 0) {
    /* 1 回目（run 33947688471）は HTTP 200 なのに 0 本だった。ページの
       作りが想定と違う（リンクを JS が組む、相対パス、別の一覧を XHR で
       読む、など）。**推測で URL を組まずに**、中身を出して次を決める。 */
    console.log(`\nHTML は ${html.length} 文字。手がかりを出す:`);
    const a29 = [
      ...new Set(
        [
          ...html.matchAll(new RegExp(`[^"'\\s<>]*${DATASET}[^"'\\s<>]*`, "g")),
        ].map((m) => m[0]),
      ),
    ];
    console.log(`  "${DATASET}" を含む語: ${a29.length} 種`);
    for (const t of a29.slice(0, 20)) console.log(`    ${t}`);
    const zips = [
      ...new Set(
        [...html.matchAll(/[^"'\s<>]*\.zip[^"'\s<>]*/g)].map((m) => m[0]),
      ),
    ];
    console.log(`  ".zip" を含む語: ${zips.length} 種`);
    for (const t of zips.slice(0, 10)) console.log(`    ${t}`);
    const scripts = [...html.matchAll(/<script[^>]*src=["']([^"']+)["']/g)].map(
      (m) => m[1],
    );
    console.log(`  script src: ${scripts.length} 本`);
    for (const t of scripts.slice(0, 15)) console.log(`    ${t}`);
    const onclicks = [...html.matchAll(/onclick=["']([^"']{0,200})/g)].map(
      (m) => m[1],
    );
    console.log(`  onclick: ${onclicks.length} 個（先頭 5）`);
    for (const t of onclicks.slice(0, 5)) console.log(`    ${t}`);
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    console.log(`  title: ${title}`);
  }
  for (const [ver, prefs] of [...byVersion.entries()].sort()) {
    console.log(`  ${ver}: ${prefs.size} 県`);
  }
  if (urls.size > 0 && byVersion.size === 0) {
    console.log("\nURL の形が想定と違う。先頭 5 本:");
    for (const u of [...urls].slice(0, 5)) console.log(`  ${u}`);
  }

  console.log("\n## 2. 年版ごとの大きさ（3 県だけ HEAD）\n");
  console.log("| 年版 | 県 | HTTP | バイト | 種類 |");
  console.log("|---|---|---|---|---|");
  let nationalHeads = 0;
  for (const [ver, prefs] of [...byVersion.entries()].sort().reverse()) {
    /* 県分けなら 3 県、全国 1 本ならその 1 本（年版は新しい順に上限まで）。 */
    if (prefs.has("all") && nationalHeads++ >= MAX_NATIONAL_HEADS) {
      console.log(
        `| ${ver} | all | — | — | 上限（${MAX_NATIONAL_HEADS} 年版）で省略 |`,
      );
      continue;
    }
    const keys = prefs.has("all") ? ["all"] : SAMPLE_PREFS;
    for (const pref of keys) {
      const path = prefs.get(pref);
      if (!path) {
        console.log(`| ${ver} | ${pref} | — | — | 一覧に無い |`);
        continue;
      }
      await wait();
      const r = await head(`https://nlftp.mlit.go.jp${path}`);
      console.log(
        `| ${ver} | ${pref} | ${r.status} | ${r.bytes === null ? "?" : r.bytes.toLocaleString()} | ${r.type} |`,
      );
    }
  }

  console.log("\n## 3. 取り込む前に読むもの\n");
  console.log(`- 利用規約: ${TERMS}`);
  console.log(`- 一覧（形式・座標系・年版の説明）: ${DATALIST}`);
  console.log(
    "\n国土数値情報は出典の明示が要る。取り込むなら地図の帰属表示に「国土数値情報（用途地域データ）（国土交通省）」を足すこと。",
  );
}

main().catch((e) => {
  console.error("落ちた:", e);
  process.exit(1);
});
