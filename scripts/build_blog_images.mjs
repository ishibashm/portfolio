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
    /*
      ここは方位を塗ってよい数少ない例。八宅の吉方位は本命卦が決まった
      時点で 4 方位に固定され、年ごとに動かない（記事の主旨）。
      九星気学のように日や人で変わるものではない。
    */
    slug: "feng-shui-and-kigaku-side-by-side",
    kicker: "引越しの考え方",
    title: "八宅の吉方位は、<br>4 方位で固定",
    sub: "本命卦が決まった時点で決まり、年ごとに動きません。ここが九星気学と最も違います。",
    body: `<div style="display:flex;gap:34px;align-items:center">
        ${board(["北", "東", "南東", "南"], "東四命（坎・震・巽・離）")}
        ${board(["北東", "南西", "西", "北西"], "西四命（坤・乾・兌・艮）")}
        <div class="note" style="max-width:290px">
          この 2 組しかありません。<b>同じ方位で九星気学と答えが割れるのは普通に起きます。</b>
          どちらかが間違っているのではなく、見ている規則が違います。
        </div>
      </div>`,
  },
  {
    slug: "who-decided-the-prohibitions",
    kicker: "引越しの考え方",
    title: "外れたことを、<br>確認しにくい形をしている",
    sub: "誰か一人が作ったと示す史料はありません。広まり方は、主張の形で説明できます。",
    body: `<div style="display:flex;gap:30px;align-items:center">
        <div style="background:#fff;border:1px solid #e2d9d1;border-radius:14px;padding:22px 26px;width:400px">
          <div style="font-size:17px;color:#64748b;font-weight:700">1979 年の天中殺ブーム</div>
          <div style="margin-top:10px;font-size:38px;font-weight:800;color:#e11d48">300 万部超</div>
          <div style="margin-top:8px;font-size:17px;color:#475569">
            関連書 2 冊で。その年のベストセラー 1 位と 2 位
          </div>
        </div>
        <div class="note" style="max-width:330px">
          <b>「してはいけない」は、守れば何も起きず、破って何も起きなくても「軽く済んだ」と読めます。</b>
          誰の思惑かという話より、この性質のほうが広まり方をよく説明します。
        </div>
      </div>`,
  },
  {
    slug: "why-directions-were-thought-lucky",
    kicker: "引越しの考え方",
    title: "当時の条件では、<br>筋の通った推論だった",
    sub: "方角に良し悪しがあるという発想は、思いつきで生まれたものではありません。",
    body: `<div style="display:flex;flex-direction:column;gap:11px">
        ${[
          "方角は、季節と時刻を測る唯一の物差しだった",
          "地形と季節風で、方角によって住み心地が実際に違った",
          "都と屋敷の設計そのものが方位で決まっていた",
          "説明のつかない不運に、理由を与える枠組みが要った",
        ]
          .map(
            (t, i) => `<div style="display:flex;align-items:center;gap:16px">
            <div style="width:38px;height:38px;border-radius:50%;background:#e11d48;color:#fff;flex:none;
                 display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:800">${i + 1}</div>
            <div style="font-size:21px;color:#0f172a">${t}</div>
          </div>`,
          )
          .join("")}
      </div>`,
  },
  {
    /*
      75 日で変わるのは起点だけ。前の移動の判定を消したり足し引きしたり
      する処理は無い、というのが記事の主旨。#950 の「層をまたいだ相殺」
      とは別の話（あちらは年月日の層、こちらは起点）。
    */
    slug: "does-a-lucky-move-cancel-an-unlucky-move",
    kicker: "引越しの考え方",
    title: "75 日で変わるのは、<br>次をどこから測るか",
    sub: "前の移動の判定を消したり、後の吉と足し引きしたりはしません。",
    body: `<div style="display:flex;flex-direction:column;gap:20px">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:52px;height:52px;border-radius:50%;background:#0f172a;color:#fff;
               display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800">A</div>
          <div style="width:150px;height:4px;background:#e11d48"></div>
          <div style="font-size:18px;font-weight:800;color:#e11d48">凶方位</div>
          <div style="width:60px;height:4px;background:#e11d48"></div>
          <div style="width:52px;height:52px;border-radius:50%;background:#0f172a;color:#fff;
               display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800">B</div>
        </div>
        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:52px;font-size:15px;color:#94a3b8;text-align:center">75 日</div>
          <div style="font-size:18px;color:#475569">住むと、起点が <b style="color:#0f172a">A から B へ移る</b></div>
        </div>
        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:52px;height:52px;border-radius:50%;background:#e2d9d1;color:#78716c;
               display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800">A</div>
          <div style="width:52px"></div>
          <div style="width:52px;height:52px;border-radius:50%;background:#0f172a;color:#fff;
               display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800">B</div>
          <div style="width:150px;height:4px;background:#94a3b8"></div>
          <div style="width:52px;height:52px;border-radius:50%;background:#0f172a;color:#fff;
               display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800">C</div>
        </div>
      </div>
      <div class="note" style="max-width:270px"><b>B→C の判定は B から測ります。</b>A→B の判定はそのまま残ります。</div>`,
  },
  {
    slug: "why-time-was-thought-lucky",
    kicker: "引越しの考え方",
    title: "日の吉凶は、<br>ぜんぶ「数え方」",
    sub: "先に数え方の構造があって、意味はあとから乗りました。",
    body: `<div style="display:flex;gap:16px">
        ${[
          ["天中殺", "六十干支から余る 2 支"],
          ["六曜", "旧暦の月と日の足し算"],
          ["一粒万倍日", "季節と干支の照合"],
        ]
          .map(
            ([
              name,
              how,
            ]) => `<div style="width:200px;background:#fff;border:1px solid #e2d9d1;
               border-radius:14px;padding:20px 22px;text-align:center">
            <div style="font-size:22px;font-weight:800;color:#0f172a">${name}</div>
            <div style="margin-top:10px;font-size:16px;line-height:1.6;color:#64748b">${how}</div>
          </div>`,
          )
          .join("")}
        <div class="note" style="max-width:250px">「悪いことが起きる日を観察して集めた」のではありません。<b>どれも機械的に決まります。</b></div>
      </div>`,
  },
  {
    slug: "tenchusatsu-names-and-schools",
    kicker: "引越しの考え方",
    title: "呼び名は違っても、<br>算出は同じ",
    sub: "大殺界だけが別の系統です。",
    body: `<div style="display:flex;gap:30px;align-items:center">
        <div>
          <div style="display:flex;gap:10px">
            ${["空亡", "天中殺", "天冲殺"]
              .map(
                (
                  n,
                ) => `<div style="width:118px;background:#fff;border:1px solid #e2d9d1;border-radius:12px;
                 padding:16px 0;text-align:center;font-size:21px;font-weight:800;color:#0f172a">${n}</div>`,
              )
              .join("")}
          </div>
          <div style="margin-top:12px;font-size:17px;color:#475569;text-align:center">
            六十干支から余る 2 支。呼び名と読み方が体系ごとに違うだけ
          </div>
        </div>
        <div>
          <div style="width:150px;background:#fff;border:2px solid #e11d48;border-radius:12px;
               padding:16px 0;text-align:center;font-size:21px;font-weight:800;color:#e11d48">大殺界</div>
          <div style="margin-top:12px;font-size:17px;color:#475569;text-align:center;width:180px">
            12 年周期から出る別系統。長さも違う（3 年）
          </div>
        </div>
      </div>`,
  },
  {
    /* 数字は記事の「先に結論」から。2026 年 8 月時点の集計。 */
    slug: "how-we-analyze-the-rental-market",
    kicker: "データの見方",
    title: "平均で相場を語ると、<br>2 万円以上高く見える",
    sub: "家賃の分布は右に大きく歪んでいます。相場を 1 つの数字で言うなら中央値です。",
    body: `<div style="display:flex;gap:26px;align-items:flex-end">
        ${[
          ["平均", "81,991 円", 300, "#cbd5e1", "#475569"],
          ["中央値", "66,000 円", 242, "#e11d48", "#0f172a"],
        ]
          .map(
            ([name, yen, w, bg, fg]) => `<div>
            <div style="font-size:18px;font-weight:800;color:#334155;margin-bottom:8px">${name}</div>
            <div style="width:${w}px;height:44px;border-radius:6px;background:${bg}"></div>
            <div style="margin-top:10px;font-size:26px;font-weight:800;color:${fg}">${yen}</div>
          </div>`,
          )
          .join("")}
        <div class="note" style="max-width:270px">駅徒歩 1 分の重みも地域で違います。<b>東京都 -2.05%/分、広島県 -0.34%/分</b>。同じ「駅近」でも意味が違います。</div>
      </div>`,
  },
  {
    slug: "how-to-choose-land",
    kicker: "データの見方",
    title: "土地の値段は、<br>自分で確かめられる",
    sub: "専門家に相談する前に、公的な資料で分かることがあります。",
    body: `<div style="display:flex;gap:16px">
        ${[
          [
            "値段の基準は 2 つ",
            "地価公示（国の鑑定による標準地の価格）と成約価格（実際に売買が成立した額）。役割が違うので両方見る",
          ],
          [
            "値段の差は制度で説明できる",
            "同じ広さで違う理由の大半は用途地域（何が建てられるか）と接道（道路にどう接するか）",
          ],
          [
            "災害リスクは印象で決めない",
            "国のハザードマップで確かめる。確認は無料",
          ],
        ]
          .map(
            ([
              head,
              note,
            ]) => `<div style="width:196px;background:#fff;border:1px solid #e2d9d1;
               border-radius:14px;padding:18px 20px">
            <div style="font-size:19px;font-weight:800;color:#0f172a;line-height:1.4">${head}</div>
            <div style="margin-top:9px;font-size:15px;line-height:1.65;color:#64748b">${note}</div>
          </div>`,
          )
          .join("")}
      </div>`,
  },
  {
    /*
      「バランス帯」は 0.4〜0.6（土地と建物がほぼ半々）。記事の定義。
      割合は 2021 年以降の成約からの当サイトの推計。
    */
    slug: "where-land-and-building-balance",
    kicker: "データの見方",
    title: "半々の配分は、<br>どこでも少数派",
    sub: "総額に占める建物代が 0.4〜0.6 に入る取引の割合。県単位で最も高くても 3 割です。",
    body: `<div style="display:flex;flex-direction:column;gap:9px">
        ${[
          ["大分", 31.5],
          ["愛知", 31.4],
          ["大阪", 19.0],
          ["京都", 13.2],
          ["神奈川", 9.6],
          ["東京", 3.9],
        ]
          .map(
            ([
              name,
              pct,
            ]) => `<div style="display:flex;align-items:center;gap:14px">
            <div style="width:78px;font-size:18px;font-weight:800;color:#334155;text-align:right">${name}</div>
            <div style="width:${Math.round(pct * 13)}px;height:24px;border-radius:4px;background:${
              pct < 10 ? "#e11d48" : "#94a3b8"
            }"></div>
            <div style="font-size:18px;color:#475569">${pct.toFixed(1)}%</div>
          </div>`,
          )
          .join("")}
      </div>
      <div class="note" style="max-width:270px">港区の建物比率は中央値 <b>0.034</b>。価格のほぼ全部が土地です。<br><span style="font-size:16px">建物比率は成約データの内訳ではなく当サイトの推計です。</span></div>`,
  },
  {
    /*
      記事 141〜144 行の実測。東京から真東へ 100km 動いたあと、直角方向へ
      何 km で扇形を出るか。四正は幅 30 度で 27km、四隅は 60 度で 58km。
    */
    slug: "honmeisatsu-year-board-next-move",
    kicker: "引越しの考え方",
    title: "扇形から出るのに<br>要る距離",
    sub: "1 回目に 100km 動いたあと、直角方向へどれだけ進めば方位が変わるか。",
    body: `<div style="display:flex;flex-direction:column;gap:16px">
        ${[
          ["東（四正）", "幅 30 度", "27km", 135],
          ["南東（四隅）", "幅 60 度", "58km", 290],
        ]
          .map(
            ([
              name,
              width,
              km,
              w,
            ]) => `<div style="display:flex;align-items:center;gap:16px">
            <div style="width:150px;font-size:19px;font-weight:800;color:#334155;text-align:right">${name}</div>
            <div style="width:96px;font-size:17px;color:#64748b">${width}</div>
            <div style="width:${w}px;height:28px;border-radius:5px;background:#e11d48"></div>
            <div style="font-size:19px;font-weight:800;color:#0f172a;white-space:nowrap">${km}</div>
          </div>`,
          )
          .join("")}
      </div>
      <div class="note" style="max-width:300px"><b>同じ向きへ足しても、どれだけ進んでも扇形からは出ません。</b>幅が倍あると、要る距離も倍になります。</div>`,
  },
  {
    /* 記事の実測。9 星ぶん 2026-01-01 から 730 日を数えたもの。 */
    slug: "what-is-honmei-teki-satsu",
    kicker: "引越しの考え方",
    title: "日盤なら 730 日中 60〜81 日。<br>年盤なら丸 1 年",
    sub: "本命的殺は本命殺の真向かいで、必ず対で生じます。",
    body: `<div style="display:flex;flex-direction:column;gap:20px">
        <div>
          <div style="font-size:18px;font-weight:800;color:#334155;margin-bottom:8px">日盤（730 日のうち）</div>
          <div style="display:flex;width:560px;height:34px;border-radius:6px;overflow:hidden;border:1px solid #e2d9d1">
            <div style="width:8.2%;background:#e11d48"></div>
            <div style="width:2.9%;background:#f5a3b7"></div>
            <div style="flex:1;background:#fff"></div>
          </div>
          <div style="margin-top:8px;font-size:16px;color:#64748b">60〜81 日（本命星によって違う）</div>
        </div>
        <div>
          <div style="font-size:18px;font-weight:800;color:#334155;margin-bottom:8px">年盤で当たった年</div>
          <div style="width:560px;height:34px;border-radius:6px;background:#e11d48;border:1px solid #be123c"></div>
          <div style="margin-top:8px;font-size:16px;color:#64748b">その年は毎日（365 日）</div>
        </div>
      </div>`,
  },
  {
    /*
      「やむを得ない場合は軽い」という言い方に対して、計算の入力に
      動機の欄が無いという事実を出す。記事の主旨そのまま。
    */
    slug: "moved-to-an-unlucky-direction",
    kicker: "引越しの考え方",
    title: "計算に「事情」を<br>入れる欄はない",
    sub: "「やむを得ない場合は影響が軽い」の線引きを決める計算はありません。",
    body: `<div style="display:flex;gap:34px;align-items:center">
        <div style="background:#fff;border:1px solid #e2d9d1;border-radius:14px;padding:20px 24px;width:330px">
          <div style="font-size:17px;font-weight:800;color:#64748b;margin-bottom:12px">判定が使う入力</div>
          ${["生年月日", "出発地", "目的地", "移動する日"]
            .map(
              (x) =>
                `<div style="font-size:19px;font-weight:700;color:#0f172a;margin-top:7px">${x}</div>`,
            )
            .join("")}
          <div style="margin-top:14px;padding-top:12px;border-top:1px dashed #d6cec6;
               font-size:19px;font-weight:700;color:#c0b8b0;text-decoration:line-through">事情・動機</div>
        </div>
        <div class="note" style="max-width:330px">
          取り消す計算もありません。<b>過去の移動を無かったことにする規則は、どの流派にもありません。</b>
        </div>
      </div>`,
  },
  {
    /* 洛書。縦・横・斜めのどれを足しても 15 になる。記事の並びそのまま。 */
    slug: "why-nine-stars-and-that-order",
    kicker: "引越しの考え方",
    title: "九星の並びは、<br>三行三列の魔方陣",
    sub: "縦・横・斜めのどの列を足しても 15。この配置に方位が乗っています。",
    body: `<div style="display:flex;gap:36px;align-items:center">
        <div style="display:grid;grid-template-columns:repeat(3,64px);grid-template-rows:repeat(3,64px);gap:6px">
          ${[4, 9, 2, 3, 5, 7, 8, 1, 6]
            .map(
              (
                n,
              ) => `<div style="background:#fff;border:1px solid #e2d9d1;border-radius:9px;
                 display:flex;align-items:center;justify-content:center;
                 font-size:30px;font-weight:800;color:${n === 5 ? "#e11d48" : "#0f172a"}">${n}</div>`,
            )
            .join("")}
        </div>
        <div class="note" style="max-width:400px">
          4+9+2、3+5+7、8+1+6。縦も斜めも同じく <b>15</b>。<br>
          中国ではこの並びを<b>洛書</b>、方位を割り当てたものを<b>九宮</b>と呼びました。
          「一白は北」「五黄は中央」は、<b>先に数の配置があって、あとから意味が乗った</b>順序です。
        </div>
      </div>`,
  },
  {
    slug: "where-kigaku-and-houi-came-from",
    kicker: "引越しの考え方",
    title: "「気学」という名前は<br>大正 13 年から",
    sub: "古代から途切れずに伝わった一つの体系ではありません。",
    body: `<div style="display:flex;flex-direction:column;gap:10px">
        ${[
          [
            "律令国家〜平安",
            "陰陽寮（国の役所）が暦と方角の吉凶を決めた",
            false,
          ],
          ["江戸", "民間の方鑑家が九星の方位判断を広めた", false],
          ["明治 3〜5 年", "政府が陰陽寮を廃止し、陰陽道を禁じた", false],
          ["大正 13 年", "園田真次郎が整理して「気学」と名づけた", true],
          ["昭和後期以降", "出版と放送で一般に広まった", false],
        ]
          .map(
            ([
              era,
              what,
              hit,
            ]) => `<div style="display:flex;align-items:center;gap:16px">
            <div style="width:150px;font-size:17px;font-weight:800;text-align:right;
                 color:${hit ? "#e11d48" : "#64748b"}">${era}</div>
            <div style="width:10px;height:10px;border-radius:50%;background:${hit ? "#e11d48" : "#cbd5e1"}"></div>
            <div style="font-size:17px;color:${hit ? "#0f172a" : "#475569"};font-weight:${hit ? 800 : 400}">${what}</div>
          </div>`,
          )
          .join("")}
      </div>`,
  },
  {
    slug: "is-there-statistical-evidence-for-houi",
    kicker: "データの見方",
    title: "「確かめられていない」と<br>「効果が無い」は違う",
    sub: "九星気学の方位判断を対象にした査読付きの検証研究は、確認できた範囲では見当たりません。",
    body: `<div style="display:flex;gap:20px;align-items:stretch">
        ${[
          [
            "統計学が要求する作法",
            "母集団を決める／対照群を置く／手続きを先に決める／外れた場合も記録する",
          ],
          ["九星気学の成り立ち", "この作法で作られたものではない"],
          [
            "言えること",
            "効果が無いと証明されたのではなく、確かめられていない",
          ],
        ]
          .map(
            (
              [head, note],
              i,
            ) => `<div style="width:236px;background:#fff;border:1px solid ${
              i === 2 ? "#e11d48" : "#e2d9d1"
            };border-radius:14px;padding:18px 20px">
            <div style="font-size:18px;font-weight:800;color:${i === 2 ? "#e11d48" : "#0f172a"}">${head}</div>
            <div style="margin-top:8px;font-size:15px;line-height:1.65;color:#475569">${note}</div>
          </div>`,
          )
          .join("")}
      </div>`,
  },
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
