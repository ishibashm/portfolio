/**
 * 記事の代表画像を作る。
 *
 * Google Discover は画像で読ませる面なので、画像の無い記事は内容と関係なく
 * 対象外になる。共有カード（og:image）も、27 記事すべてが同じ /ogp.png を
 * 指していた。
 *
 * **写真ではなく図にする。**記事の中身が「本命的殺の方位は毎年動く」の
 * ような計算の話なので、街の写真はサムネイルと中身が一致しない。判定の
 * 内容そのものを図にすれば、他所に同じ画像が無い。
 *
 * 図は HTML で書いて Chromium で撮る。日本語のフォントはシステムのものが
 * そのまま使えるので、フォントファイルを同梱する必要がない。
 *
 *   node scripts/build_blog_images.mjs
 *
 * Chromium が playwright の既定の場所に無い環境では、実行ファイルの場所を
 * CHROMIUM_PATH で渡す（`npx playwright install` を打てない環境向け）。
 *
 * 出力は public/blog/<slug>.png。**リポジトリに入れる**（毎回の生成に
 * Chromium が要り、本番のビルドで動かすと重い）。記事を足したら手で回す。
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const OUT_DIR = path.join(process.cwd(), "public", "blog");

/** 画像の大きさ。Discover は幅 1200px 以上を条件に挙げている。 */
const WIDTH = 1200;
const HEIGHT = 630;
const SCALE = 1.5;

/** サイトの配色に合わせる。地色・強調・本文の 3 つだけ使う。 */
const BASE_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
/* 地色は単色。グラデーションにすると PNG がほとんど圧縮されず、
   1 枚 500KB になる（単色なら 60KB 前後）。記事のぶんだけ増えるので、
   リポジトリに入れる以上ここは効く。 */
body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:#f7f2ec;
     font-family:"Noto Sans CJK JP","Hiragino Sans",sans-serif;color:#0f172a;
     display:flex;flex-direction:column;padding:52px 60px 44px}
.kicker{font-size:19px;letter-spacing:.14em;color:#e11d48;font-weight:700}
h1{font-size:50px;line-height:1.26;margin-top:14px;font-weight:800;letter-spacing:-.01em}
.sub{margin-top:16px;font-size:21px;line-height:1.55;color:#475569}
.body{flex:1;display:flex;align-items:center;gap:40px;margin-top:26px}
.note{font-size:20px;color:#475569;line-height:1.65;max-width:340px}
.note b{color:#0f172a}
.brand{font-size:18px;color:#64748b;border-top:1px solid #d6cec6;padding-top:13px}
.g{display:grid;grid-template-columns:repeat(3,54px);grid-template-rows:repeat(3,54px);gap:5px}
.c{background:#fff;border:1px solid #e2d9d1;border-radius:7px;display:flex;
   align-items:center;justify-content:center;font-size:16px;color:#94a3b8;font-weight:700}
.c.hit{background:#e11d48;border-color:#be123c;color:#fff}
.c.mid{background:#efe7e0;color:#b6ada5}
figure{text-align:center}
figcaption{font-size:18px;color:#475569;margin-top:9px;font-weight:700}
`;

/** 八方位の盤。hit に入れた方位だけ塗る（1 つでも複数でもよい）。 */
function board(hit, caption) {
  const hits = Array.isArray(hit) ? hit : [hit];
  const cells = ["北西", "北", "北東", "西", "中", "東", "南西", "南", "南東"]
    .map((d) => {
      if (d === "中") return `<div class="c mid">中</div>`;
      return `<div class="c${hits.includes(d) ? " hit" : ""}">${d}</div>`;
    })
    .join("");
  return `<figure><div class="g">${cells}</div><figcaption>${caption}</figcaption></figure>`;
}

/**
 * 記事ごとの図。**中身は記事に書いてあることだけ。**
 * 画像のために新しい主張を作らない（記事と食い違う）。
 */
const FIGURES = [
  {
    /* 9 と 60 の最小公倍数が 180。記事の検算をそのまま帯の長さにする。 */
    slug: "does-bad-direction-last-60-years",
    kicker: "引越しの考え方",
    title: "60 年は、年盤から<br>出てくる数字ではない",
    sub: "九星の一巡と干支の一巡は、周期が違います。",
    body: `<div style="display:flex;flex-direction:column;gap:13px">
        ${[
          ["九星の年盤", "9 年で一巡", 30, "#e11d48"],
          ["干支", "60 年で一巡", 200, "#94a3b8"],
          ["両方そろう", "180 年", 600, "#0f172a"],
        ]
          .map(
            ([
              name,
              note,
              w,
              color,
            ]) => `<div style="display:flex;align-items:center;gap:14px">
            <div style="width:118px;font-size:18px;font-weight:800;color:#334155;text-align:right">${name}</div>
            <div style="width:${w}px;height:26px;border-radius:5px;background:${color}"></div>
            <div style="font-size:18px;color:#475569;white-space:nowrap">${note}</div>
          </div>`,
          )
          .join("")}
      </div>`,
  },
  {
    slug: "how-many-schools-are-there",
    kicker: "引越しの考え方",
    title: "流派の数は、<br>誰にも数えられない",
    sub: "数そのものより「流派が違うとどこの答えが変わるか」を押さえます。",
    body: `<div style="display:flex;gap:14px">
        ${[
          ["登録制度がない", "名乗るのに免許が要らない"],
          ["分派が続いている", "数えた瞬間に増える"],
          ["境界が曖昧", "同じ名前で規則が違うことがある"],
        ]
          .map(
            ([
              head,
              note,
            ]) => `<div style="width:196px;background:#fff;border:1px solid #e2d9d1;
               border-radius:14px;padding:18px 20px">
            <div style="font-size:20px;font-weight:800;color:#0f172a">${head}</div>
            <div style="margin-top:8px;font-size:16px;line-height:1.6;color:#64748b">${note}</div>
          </div>`,
          )
          .join("")}
      </div>`,
  },
  {
    /*
      「方位」と「期間」は別の系統（九星気学と算命学）から来ている、
      という記事の主旨をそのまま軸にする。重ねているのはこのサイトの
      作りであって、すべての流派に共通する作法ではない。
    */
    slug: "tenchusatsu-and-lucky-directions",
    kicker: "引越しの考え方",
    title: "吉方位は「どちらへ」、<br>天中殺は「いつ」",
    sub: "反対語ではありません。同じ引越しに、方位の判定と期間の判定が同時にあります。",
    body: `<div style="display:flex;gap:34px;align-items:center">
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="display:flex;align-items:center;gap:14px">
            <div style="width:104px;font-size:19px;font-weight:800;color:#0f172a;text-align:right">吉方位</div>
            <div style="font-size:17px;color:#475569">どちらへ移るか（九星気学）</div>
          </div>
          <div style="display:flex;align-items:center;gap:14px">
            <div style="width:104px;font-size:19px;font-weight:800;color:#0f172a;text-align:right">天中殺</div>
            <div style="font-size:17px;color:#475569">いつ動くか（算命学）</div>
          </div>
          <div style="margin-top:6px;padding:14px 18px;background:#fff;border:1px solid #e2d9d1;border-radius:14px;
               font-size:17px;line-height:1.6;color:#475569;width:420px">
            両方を 1 つの画面で見られるように重ねています。これは<b style="color:#0f172a">このサイトの作り</b>で、
            すべての流派に共通する作法ではありません。
          </div>
        </div>
        ${/* どの方位が吉かは人と日で変わるので、ここでは 1 つも塗らない */ ""}
        ${board([], "「どちらへ」＝八方位のどれか")}
      </div>`,
  },
  {
    /*
      数字は記事の表と `lib/directionDistance.ts` の実測から。距離 ×
      tan(22.5 度) がそのまま「隣の方位に変わるまでの横ずれ」になる。
    */
    slug: "how-much-does-distance-matter",
    kicker: "データの見方",
    title: "近いほど、方位は<br>ピンの置き方で決まる",
    sub: "方位は角度なので、短い移動ほど境目までの余裕が小さくなります。",
    body: `<div style="display:flex;flex-direction:column;gap:9px">
        ${[
          ["0.5km", "207m", 6],
          ["1km", "414m", 12],
          ["5km", "2,071m", 60],
          ["30km", "12.4km", 300],
        ]
          .map(
            ([
              km,
              shift,
              w,
            ]) => `<div style="display:flex;align-items:center;gap:14px">
            <div style="width:62px;font-size:19px;font-weight:800;color:#334155;text-align:right">${km}</div>
            <div style="width:${w}px;height:26px;border-radius:5px;background:#e11d48"></div>
            <div style="font-size:19px;color:#475569">${shift}</div>
          </div>`,
          )
          .join("")}
      </div>
      <div class="note"><b>住所から出す座標の誤差は数百 m。</b>1〜2km 以下では、移動そのものより誤差のほうが方位を決めます。</div>`,
  },
  {
    slug: "year-board-blocks-a-whole-year",
    kicker: "引越しの考え方",
    title: "年盤が塞ぐ方位は、<br>1 年動かない",
    sub: "月や日をどう選んでも、年盤の判定は変わりません。",
    body: `<div>
        <div style="display:flex;gap:4px">
          ${Array.from({ length: 12 })
            .map(
              (_, i) => `<div style="width:44px">
              <div style="height:44px;border-radius:6px;background:#e11d48"></div>
              <div style="margin-top:6px;font-size:14px;color:#64748b;text-align:center">${i + 1}月</div>
            </div>`,
            )
            .join("")}
        </div>
      </div>
      <div class="note" style="max-width:280px"><b>引き渡し日と入居日は別です。</b>方位が効くのは生活の拠点を移す移動なので、入居をずらせる場合があります。</div>`,
  },
  {
    slug: "doyou-and-doyousatsu",
    kicker: "引越しの考え方",
    title: "土用は期間、土用殺は方位",
    sub: "名前は似ていますが、効き方が違います。",
    body: `<div style="display:flex;gap:44px;align-items:flex-start">
        <div>
          <div style="font-size:19px;font-weight:800;color:#334155;margin-bottom:10px">土用（期間）</div>
          <div style="display:flex;gap:3px">
            ${Array.from({ length: 24 })
              .map(
                (_, i) =>
                  `<div style="width:11px;height:56px;border-radius:3px;background:${
                    i % 6 === 1 ? "#e11d48" : "#e7ded6"
                  }"></div>`,
              )
              .join("")}
          </div>
          <div style="margin-top:12px;font-size:17px;color:#64748b">年 4 回・各 18 日ほど。<br>合わせて 1 年の約 2 割</div>
        </div>
        <div>
          <div style="font-size:19px;font-weight:800;color:#334155;margin-bottom:10px">土用殺（方位）</div>
          ${board(
            ["南東", "南西", "北西", "北東"],
            "季節ごとに四隅を 1 つずつ",
          )}
        </div>
      </div>`,
  },
  {
    slug: "can-you-recover-from-honmei-teki",
    kicker: "引越しの考え方",
    title: "本命的殺の方位は、毎年動く",
    sub: "七赤金星の場合。移ってしまった方位が、翌年も同じとは限りません。",
    body: `<div style="display:flex;gap:22px">
        ${board("北東", "2026年")}${board("西", "2027年")}${board("北西", "2028年")}
      </div>
      <div class="note">本命星が中宮に入る年には、盤上から消えます（七赤金星なら 2029 年）。</div>`,
  },
  {
    slug: "can-good-outweigh-a-bad-move",
    kicker: "引越しの考え方",
    title: "層をまたいだ相殺は、しない",
    sub: "このサイトの判定は、年盤・月盤・日盤それぞれで出します。合計点は出しません。",
    body: `<div style="display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;align-items:center;gap:16px">
          <div style="width:74px;font-size:21px;font-weight:800;color:#334155">年盤</div>
          <div style="width:300px;height:52px;border-radius:9px;display:flex;align-items:center;
               justify-content:center;font-size:20px;font-weight:800;border:1px solid;
               background:#e11d48;border-color:#be123c;color:#fff">凶</div>
        </div>
        <div style="display:flex;align-items:center;gap:16px">
          <div style="width:74px;font-size:21px;font-weight:800;color:#334155">月盤</div>
          <div style="width:300px;height:52px;border-radius:9px;display:flex;align-items:center;
               justify-content:center;font-size:20px;font-weight:800;border:1px solid #cbd5e1;
               background:#fff;color:#64748b">吉</div>
          <div style="font-size:19px;color:#e11d48;font-weight:800">相殺しない</div>
        </div>
        <div style="display:flex;align-items:center;gap:16px">
          <div style="width:74px;font-size:21px;font-weight:800;color:#334155">日盤</div>
          <div style="width:300px;height:52px;border-radius:9px;display:flex;align-items:center;
               justify-content:center;font-size:20px;font-weight:800;border:1px solid #cbd5e1;
               background:#fff;color:#64748b">吉</div>
          <div style="font-size:19px;color:#e11d48;font-weight:800">相殺しない</div>
        </div>
      </div>
      <div class="note"><b>年盤で凶なら、日盤が吉でも年盤の凶は消えません。</b>点数の足し引きで「上回る」計算はありません。</div>`,
  },
  {
    /*
      方位角は実際に計算した値。大圏方位角を伝統区分（四正 30 度・
      四隅 60 度）で切っている。境目から遠い組み合わせを選んであるので、
      どちらも安定して同じ区分に入る。
    */
    slug: "direction-seen-from-the-original-home",
    kicker: "引越しの考え方",
    title: "同じ物件でも、方位は人によって違う",
    sub: "方位は「いま住んでいる場所から見た向き」で決まります。",
    body: `<div style="display:flex;gap:34px;align-items:center">
        <div style="background:#fff;border:1px solid #e2d9d1;border-radius:14px;padding:22px 26px;width:330px">
          <div style="font-size:17px;color:#64748b;font-weight:700">東京駅のあたりに住む人から</div>
          <div style="font-size:23px;font-weight:800;margin-top:4px">大宮の物件は</div>
          <div style="margin-top:14px;font-size:40px;font-weight:800;color:#e11d48">北西</div>
          <div style="font-size:18px;color:#64748b;margin-top:6px">方位角 332.7度／28km</div>
        </div>
        <div style="background:#fff;border:1px solid #e2d9d1;border-radius:14px;padding:22px 26px;width:330px">
          <div style="font-size:17px;color:#64748b;font-weight:700">立川駅のあたりに住む人から</div>
          <div style="font-size:23px;font-weight:800;margin-top:4px">同じ物件が</div>
          <div style="margin-top:14px;font-size:40px;font-weight:800;color:#e11d48">北東</div>
          <div style="font-size:18px;color:#64748b;margin-top:6px">方位角 39.3度／30km</div>
        </div>
      </div>
      <div class="note"><b>吉方位も凶方位も、出発地ごとに変わります。</b></div>`,
  },
];

function html(fig) {
  return `<!doctype html><meta charset="utf-8"><style>${BASE_CSS}</style>
<div class="kicker">${fig.kicker}</div>
<h1>${fig.title}</h1>
<div class="sub">${fig.sub}</div>
<div class="body">${fig.body}</div>
<div class="brand">cloud-palette.com ／ 九星気学の方位と日取り</div>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  );
  for (const fig of FIGURES) {
    const page = await browser.newPage({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: SCALE,
    });
    await page.setContent(html(fig), { waitUntil: "load" });
    const out = path.join(OUT_DIR, `${fig.slug}.png`);
    await writeFile(out, await page.screenshot());
    await page.close();
    console.log(`${fig.slug}.png (${WIDTH * SCALE}x${HEIGHT * SCALE})`);
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
