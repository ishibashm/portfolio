import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractFaq, hasEnoughFaq, MIN_FAQ_PAIRS } from "@/lib/articleFaq";

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
