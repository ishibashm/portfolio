/**
 * 本番の画面を実際に開いて、直したものが出ているかを見る。
 *
 * テストと型だけで「直った」と言って出したところ、本番を開いたら 1 回で
 * 行き止まり（/relocation/timing の「設定を読み込んでいます…」）が出た。
 * ページは 200 を返すので、HTTP の確認では気付けない。
 *
 * ここでやるのは「文言が出ているか」までで、見た目の良し悪しは見ない。
 * DB を要する画面（物件一覧・地図のピン）はローカルからは描けないので、
 * 出発地や生年月日を要しない状態だけを対象にする。
 *
 * 使い方:
 *   node scripts/verify_production_ui.mjs
 *   BASE=http://localhost:3000 node scripts/verify_production_ui.mjs
 *   SHOT_DIR=/tmp/shots node scripts/verify_production_ui.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE || "https://cloud-palette.com";
const SHOT_DIR = process.env.SHOT_DIR || "";
const WAIT_MS = Number(process.env.WAIT_MS || 12000);

/**
 * 何を見るか。
 *   expect  出ていてほしい文言
 *   absent  出ていてほしくない文言（直したはずのもの）
 */
const CHECKS = [
  {
    name: "初回訪問の時期分析（行き止まりでない）",
    url: "/relocation/timing",
    expect: ["全期間の吉凶が出ます", "物件スキャナーで設定する"],
    absent: ["設定を読み込んでいます"],
  },
  {
    // 何も入れていない人に、初期値の計画（運営者の生年月日と
    // 京都市 → 名古屋市）への判定を出していた。「安心してそのまま計画を
    // 実行してください」まで出ており、自分の結果だと読める形だった。
    // 根拠の無い断定は、このサイトでいちばん出してはいけない。
    name: "初回訪問のシミュレータ（判定を先に出さない）",
    url: "/relocation/simulator",
    expect: ["3 つ入れると", "いま住んでいる場所", "試算する"],
    absent: [
      "総合シンクロ指数",
      "計画総合適合度",
      "安心してそのまま計画を実行",
      "一時赴任",
    ],
  },
  {
    name: "鑑定士の掲載",
    url: "/practitioners",
    expect: ["九星気学の鑑定士", "掲載を申し込む"],
    absent: [],
  },
  {
    name: "月別の引越しカレンダー",
    url: "/calendar/2026-09",
    expect: ["引越しに向く日", "中宮"],
    absent: [],
  },
  {
    name: "本命星の記事",
    url: "/houi/2026/3",
    expect: ["三碧木星"],
    absent: [],
  },
];

const browser = await chromium.launch();
const results = [];

for (const c of CHECKS) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

  let text = "";
  let status = 0;
  try {
    const res = await page.goto(`${BASE}${c.url}`, {
      waitUntil: "load",
      timeout: 120000,
    });
    status = res?.status() ?? 0;
    await page.waitForTimeout(WAIT_MS);
    text = await page.locator("body").innerText();
  } catch (e) {
    errors.push(`goto: ${String(e).slice(0, 120)}`);
  }

  const missing = c.expect.filter((n) => !text.includes(n));
  const leftover = c.absent.filter((n) => text.includes(n));
  const ok = status === 200 && missing.length === 0 && leftover.length === 0;

  if (SHOT_DIR) {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const file = path.join(SHOT_DIR, c.url.replace(/[^\w]+/g, "_") + ".png");
    await page.screenshot({ path: file }).catch(() => {});
  }

  results.push({ ...c, status, ok, missing, leftover, errors });
  await page.close();
}

await browser.close();

console.log(`対象: ${BASE}\n`);
let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? "OK  " : "NG  "}${r.name}  (${r.url}  ${r.status})`);
  if (r.missing.length)
    console.log(`      出ていない: ${r.missing.join(" / ")}`);
  if (r.leftover.length)
    console.log(`      残っている: ${r.leftover.join(" / ")}`);
  if (r.errors.length) console.log(`      エラー: ${r.errors.join(" | ")}`);
  if (!r.ok) failed++;
}
console.log(`\n${results.length - failed} / ${results.length} 件`);
process.exit(failed === 0 ? 0 : 1);
