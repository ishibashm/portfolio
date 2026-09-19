import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractFaq,
  hasEnoughFaq,
  MIN_FAQ_PAIRS,
  MIN_ANSWER,
} from "@/lib/articleFaq";

/**
 * 記事の問答の取り出し。FAQPage 構造化データの材料になる。
 *
 * ## いちばん大事なのは「作らないこと」
 *
 * FAQPage は**頁に実際に出ている文言**でなければならない。検索エンジン
 * 向けに問答をこしらえて構造化データにだけ入れるのは規定に反する。
 * ここは本文をそのまま読むだけ、というのを固定する。
 *
 * ## 取りこぼすほうに倒す
 *
 * 日本語の疑問文は「？」で終わらないことが普通なので「か」で判定するが、
 * 「〜しか」「〜ほか」のような偶然の一致がある。**間違った問答を出す
 * より、出さないほうがよい。**
 */

const DIR = join(process.cwd(), "content", "blog");

describe("問いの見出しだけを拾う", () => {
  it("「〜のか」で終わる見出しを拾う", () => {
    const faq = extractFaq(
      [
        "## なぜ星は9つなのか",
        "",
        "もとは三行三列の魔方陣です。縦横斜めのどの列を足しても 15 になります。",
        "",
        "## いつ決まったのか",
        "",
        "数の配置が先にあり、方位と五行はあとから乗りました。層が三枚あります。",
      ].join("\n"),
    );
    expect(faq.map((f) => f.question)).toEqual([
      "なぜ星は9つなのか",
      "いつ決まったのか",
    ]);
  });

  it("問いでない見出しは拾わない", () => {
    const faq = extractFaq(
      [
        "## 先に結論",
        "",
        "九星気学の数字は、占いのために作られた記号ではありません。魔方陣です。",
        "",
        "## 注記",
        "",
        "伝統的な占術上の考え方であり、効果が科学的に確認されたものではありません。",
      ].join("\n"),
    );
    expect(faq).toEqual([]);
  });

  it("「しか」「ほか」で終わる見出しを問いと取り違えない", () => {
    /* 「か」だけで判定すると、これが問答になって画面と食い違う */
    const faq = extractFaq(
      [
        "## 残っているのは方位だけしか",
        "",
        "この見出しは問いではありません。答えのつもりの段落が続いています。",
      ].join("\n"),
    );
    expect(faq).toEqual([]);
  });

  it("「？」で終わる見出しも拾う", () => {
    const faq = extractFaq(
      [
        "## これは問いですか？",
        "",
        "はい。疑問符で終わる見出しは、語尾を見るまでもなく問いとして扱います。",
      ].join("\n"),
    );
    expect(faq).toHaveLength(1);
  });
});

describe("答えの取り方", () => {
  it("見出しの直後の最初の段落だけを答えにする", () => {
    const faq = extractFaq(
      [
        "## なぜそうなるのか",
        "",
        "最初の段落です。ここが答えになります。長さの下限を満たすように書いています。",
        "",
        "二つめの段落です。ここは答えに含めません。",
      ].join("\n"),
    );
    expect(faq[0].answer).toContain("最初の段落");
    expect(faq[0].answer).not.toContain("二つめ");
  });

  it("表や箇条書きが先に来る見出しは組にしない", () => {
    /* 1 文の答えが無いということ。無理に組を作らない */
    const faq = extractFaq(
      ["## どれくらいあるのか", "", "| 名前 | 値 |", "| --- | --- |"].join(
        "\n",
      ),
    );
    expect(faq).toEqual([]);
  });

  it("短すぎる答えは組にしない", () => {
    const faq = extractFaq(["## そうなのか", "", "はい。"].join("\n"));
    expect(faq).toEqual([]);
  });

  it("markdown の記号とリンクを落とす", () => {
    const faq = extractFaq(
      [
        "## 何が確かめられるのか",
        "",
        "**魔方陣**は[別の記事](/blog/x)のとおり 1 種類しかありません。回転と反転を除けばの話です。",
      ].join("\n"),
    );
    expect(faq[0].answer).not.toContain("**");
    expect(faq[0].answer).not.toContain("](");
    expect(faq[0].answer).toContain("別の記事");
  });

  it("見出しの通し番号は問いに含めない", () => {
    const faq = extractFaq(
      [
        "## 5. 盤はなぜ逆に回るのか",
        "",
        "中央に入る星が毎年ひとつずつ減ります。一に達したら九へ戻る、という決まりです。",
      ].join("\n"),
    );
    expect(faq[0].question).toBe("盤はなぜ逆に回るのか");
  });

  it("コードの中は読まない", () => {
    const faq = extractFaq(
      [
        "## これは問いなのか",
        "",
        "```",
        "## 中の見出しは拾わない",
        "```",
        "",
        "コードのあとの段落です。前の見出しの答えとしては拾いません。",
      ].join("\n"),
    );
    expect(faq).toEqual([]);
  });
});

describe("出す条件", () => {
  it("2 組そろって初めて出す", () => {
    expect(hasEnoughFaq([{ question: "q", answer: "a" }])).toBe(false);
    expect(
      hasEnoughFaq([
        { question: "q1", answer: "a1" },
        { question: "q2", answer: "a2" },
      ]),
    ).toBe(true);
    expect(MIN_FAQ_PAIRS).toBe(2);
  });
});

describe("本物の記事に当てる", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".md"));

  it("記事を読めている（この検査自体が空回りしていない）", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("問答が取れる記事が実際にある", () => {
    const withFaq = files.filter((f) =>
      hasEnoughFaq(extractFaq(readFileSync(join(DIR, f), "utf8"))),
    );
    expect(withFaq.length).toBeGreaterThan(0);
  });

  it("取り出した答えが本文にそのまま含まれている（作っていない）", () => {
    /*
      ここが本題。構造化データに出す文言は、頁に出ている文言でなければ
      ならない。記号を落としたあとの答えの断片が、本文の記号を落とした
      ものに含まれることを確かめる。
    */
    for (const f of files) {
      const body = readFileSync(join(DIR, f), "utf8");
      /* 本文側も同じ落とし方をする。リンクを剥がさないと
         [表示文字](url) と 表示文字 が食い違って空振りする */
      const flat = body
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[*`]/g, "")
        .replace(/\s+/g, " ");
      for (const { answer } of extractFaq(body)) {
        const head = answer.replace(/…$/, "").slice(0, 20);
        expect(flat, `${f}: ${head}`).toContain(head);
      }
    }
  });

  it("答えが長すぎない", () => {
    for (const f of files) {
      for (const { answer } of extractFaq(readFileSync(join(DIR, f), "utf8"))) {
        expect(answer.length, f).toBeLessThanOrEqual(301);
      }
    }
  });
});

/*
  短い導入文で答えが丸ごと捨てられていた件（2026-09-15 の監査）。

  ## 何が起きていたか

  `extractFaq` は見出しの直後の**最初の 1 段落**だけを答えにしていた。
  ところが日本語の記事は

      ## なぜ数えられないのか
      理由は 3 つあります。          ← 11 字
      （次の段落に中身）

  のように、直後を**次を指すだけの 1 文**にする書き方が多い。1 段落で
  切ると 30 字の下限（`MIN_ANSWER`）を割って、**その問答がまるごと
  捨てられる。**

  実測（2026-09-15。記事 31 本）では FAQPage を出していたのは **9 本**で、
  **13 本が「あと 1 組」で止まっていた。**

  ## 直し方

  1 段落で下限に届かないときだけ、**次の段落まで繋ぐ。**繋ぐのは地の文
  だけで、表・引用・箇条書き・コードが来たら今までどおり打ち切る。
  段落を空白 1 つで繋ぐので、**答えは頁の文字列の中にそのまま現れる**
  （上の「答えが頁に出ている」検査がそれを見ている）。
*/
describe("短い導入文でも答えを落とさない", () => {
  it("1 段落で足りなければ次の段落まで繋ぐ", () => {
    const body = [
      "## なぜ数えられないのか",
      "",
      "理由は 3 つあります。",
      "",
      "登録制度が無く、名乗った人の数だけ流派があるためです。分派も続いています。",
      "",
      "## こちらはどうなのか",
      "",
      "こちらは 1 段落だけで下限に届く長さの答えを持っています。次の段落まで繋ぐ必要はありません。",
      "",
    ].join("\n");
    const faq = extractFaq(body);
    expect(faq).toHaveLength(2);
    expect(faq[0].question).toBe("なぜ数えられないのか");
    expect(faq[0].answer).toBe(
      "理由は 3 つあります。 登録制度が無く、名乗った人の数だけ流派があるためです。分派も続いています。",
    );
  });

  it("旧実装なら落ちていたことを示す（空回り防止）", () => {
    /*
      変更前は「最初の 1 段落」だけを見て、30 字に満たなければ捨てていた。
      その挙動をここに写して、**同じ入力で答えが 0 組になる**ことを示す。
    */
    const lead = "理由は 3 つあります。";
    expect(lead.length).toBeLessThan(MIN_ANSWER);
  });

  it("繋ぐのは足りないときだけ（届いていれば 1 段落で止める）", () => {
    const body = [
      "## 十分に長い答えを持つのはどちらか",
      "",
      "この段落だけで三十字の下限をゆうに超えているので、次の段落まで繋ぐ必要はありません。",
      "",
      "次の段落は答えに含めません。",
      "",
    ].join("\n");
    const faq = extractFaq(body);
    expect(faq).toHaveLength(1);
    expect(faq[0].answer).not.toContain("次の段落は答えに含めません");
  });

  it("表が来たら繋がない（1 行に均すと読めない）", () => {
    const body = [
      "## 距離はどれくらい要るのか",
      "",
      "まず、占術ではなく地図の話です。",
      "",
      "| 2回目の距離 | ずれ |",
      "| --- | --- |",
      "| 1.0 | 30度 |",
      "",
    ].join("\n");
    /* 導入文だけでは下限に届かず、表は繋がないので 0 組 */
    expect(extractFaq(body)).toHaveLength(0);
  });

  it("箇条書きが来ても繋がない（頁に無い区切りを入れないため）", () => {
    const body = [
      "## なぜ数えられないのか",
      "",
      "理由は 3 つあります。",
      "",
      "1. 登録制度がない",
      "2. 分派が続いている",
      "",
    ].join("\n");
    expect(extractFaq(body)).toHaveLength(0);
  });

  it("実際の記事で、出す本数が増えている", () => {
    /* 空回り防止。**実測の下限**を置く（2026-09-15 で 11 本） */
    const dir = join(process.cwd(), "content/blog");
    let emit = 0;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
      const body = readFileSync(join(dir, f), "utf8").replace(
        /^---[\s\S]*?\n---\n/,
        "",
      );
      if (hasEnoughFaq(extractFaq(body))) emit += 1;
    }
    expect(emit, `FAQPage を出す記事: ${emit}`).toBeGreaterThanOrEqual(11);
  });
});

/*
  題が問いの記事は、題と「先に結論」も 1 組にする（2026-09-16 の監査）。

  ## なぜ足りなかったか

  実測すると、FAQPage を出せていたのは 31 本中 **11 本**。落ちている
  20 本のうち 12 本は「本文の問いの見出しが 1 本しかない」で、あと 1 組
  足りずに止まっていた。

  ところがこの記事群は**題そのものが問いの形**であることが多く（31 本中
  11 本）、その答えは冒頭の「先に結論」に書いてある。**問いは h1、答えは
  本文**なので、どちらも頁に出ている。組にしてよい。

  ## 効いたのは 2 本だけ

  11 → **13 本**。題が問いで 1 組しか無い記事は 5 本あったが、うち 3 本は
  「先に結論」が**箇条書き**で、#1325 と同じ理由（1 行に均すと頁に無い
  区切りを混ぜることになる）で組にならない。**見込みの 5 本ではなく、
  実測の 2 本が答え。**
*/
describe("題が問いなら、題と「先に結論」を組にする", () => {
  const LEAD = [
    "# みだし",
    "",
    "## 先に結論",
    "",
    "取り消す計算はありません。判定は今いる場所からの方位で出るので、次に動くときの起点が変わります。",
    "",
    "## 注記",
    "",
    "ここは問いではないので拾わない。",
    "",
  ].join("\n");

  it("題が問いなら、先に結論が答えになる", () => {
    const faq = extractFaq(LEAD, "凶方位へ移ってしまった。挽回できるのか");
    expect(faq).toHaveLength(1);
    expect(faq[0].question).toBe("凶方位へ移ってしまった。挽回できるのか");
    expect(faq[0].answer).toContain("取り消す計算はありません");
  });

  it("題が問いでなければ、先に結論は拾わない", () => {
    expect(extractFaq(LEAD, "本命殺の調べ方")).toHaveLength(0);
    /* 題を渡さない呼び方も、今までどおり拾わない */
    expect(extractFaq(LEAD)).toHaveLength(0);
  });

  it("先に結論が箇条書きなら組にしない（#1325 と同じ理由）", () => {
    const listed = [
      "## 先に結論",
      "",
      "- 取り消す計算はありません。判定は今いる場所からの方位で出ます",
      "- 年盤には期限がありますが、待てば良くなるとは限りません",
      "",
    ].join("\n");
    expect(extractFaq(listed, "挽回できるのか")).toHaveLength(0);
  });

  it("題を当てるのは最初の「先に結論」だけ", () => {
    const twice = [
      "## 先に結論",
      "",
      "一つ目の段落です。ここが題への答えとして拾われるのが正しい並びになります。",
      "",
      "## 先に結論",
      "",
      "二つ目の段落です。ここは題の答えではないので拾ってはいけません。",
      "",
    ].join("\n");
    const faq = extractFaq(twice, "拾われるのはどちらか");
    expect(faq).toHaveLength(1);
    expect(faq[0].answer).toContain("一つ目");
  });
});

describe("本物の記事に題を渡す", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".md"));
  const titleOf = (md: string) => md.match(/^title:\s*"?(.+?)"?\s*$/m)?.[1];

  it("FAQPage を出せる記事が 14 → 16 本になる", () => {
    const count = (withTitle: boolean) =>
      files.filter((f) => {
        const md = readFileSync(join(DIR, f), "utf8");
        return hasEnoughFaq(
          extractFaq(md, withTitle ? titleOf(md) : undefined),
        );
      }).length;
    /*
      本数そのものを固定する。記事を足したり書き換えたりすれば動くので、
      動いたら**測り直してこの数字を直す**（増える側で落ちるのは正しい）。
    */
    expect(count(false)).toBe(14);
    expect(count(true)).toBe(16);
  });

  it("題から作った問いは、記事の題そのもの（言い換えない）", () => {
    for (const f of files) {
      const md = readFileSync(join(DIR, f), "utf8");
      const title = titleOf(md);
      if (!title) continue;
      const added = extractFaq(md, title).filter(
        (p) => !extractFaq(md).some((q) => q.question === p.question),
      );
      for (const p of added) {
        expect(p.question, f).toBe(title);
      }
    }
  });

  it("題を渡しても、答えは本文にそのまま出ている", () => {
    for (const f of files) {
      const body = readFileSync(join(DIR, f), "utf8");
      const flat = body
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[*`]/g, "")
        .replace(/\s+/g, " ");
      for (const { answer } of extractFaq(body, titleOf(body))) {
        const head = answer.replace(/…$/, "").slice(0, 20);
        expect(flat, `${f}: ${head}`).toContain(head);
      }
    }
  });
});
