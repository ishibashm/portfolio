import { describe, expect, it } from "vitest";
import {
  COMMENT_MAX_LENGTH,
  COMMENT_MIN_LENGTH,
  areaTopic,
  calendarTopic,
  displayNameFor,
  houiMonthTopic,
  houiYearTopic,
  isValidTopicKey,
  pageTopic,
  validateCommentInput,
  PAGE_TOPIC_KEYS,
} from "@/lib/comments";
import { CORE_ROUTES } from "@/lib/siteStructure";

describe("投稿の紐づけ先（topicKey）", () => {
  it("ページから機械的に作れる", () => {
    expect(houiYearTopic(2026, 3)).toBe("houi:2026:3");
    expect(houiMonthTopic(2026, 3, 9)).toBe("houi:2026:3:9");
    expect(calendarTopic(2026, 9)).toBe("calendar:2026-09");
    expect(calendarTopic(2026, 12)).toBe("calendar:2026-12");
    expect(areaTopic("23100")).toBe("area:23100");
  });

  it("作った値は必ず受理される", () => {
    const made = [
      houiYearTopic(2026, 1),
      houiYearTopic(2028, 9),
      houiMonthTopic(2026, 5, 1),
      houiMonthTopic(2026, 5, 12),
      calendarTopic(2027, 1),
      areaTopic("01100"),
    ];
    for (const k of made) expect(isValidTopicKey(k), k).toBe(true);
  });

  it("任意の文字列で話題を作らせない", () => {
    // 検証しないと、好きなだけ topic を生やせて索引も見積もりも壊れる。
    for (const k of [
      "",
      "houi",
      "houi:2026",
      "houi:2026:0", // 九星は 1..9
      "houi:2026:10",
      "houi:2026:3:13", // 月は 1..12
      "houi:2026:3:0",
      "calendar:2026-13",
      "calendar:2026-00",
      "calendar:2026-9", // 0 埋めしない形は発行しない
      "area:1234", // 5 桁
      "area:abcde",
      "'; DROP TABLE direction_comments; --",
      "houi:2026:3 ",
    ]) {
      expect(isValidTopicKey(k), JSON.stringify(k)).toBe(false);
    }
  });

  it("文字列以外は弾く", () => {
    for (const k of [null, undefined, 123, {}, []]) {
      expect(isValidTopicKey(k)).toBe(false);
    }
  });
});

describe("投稿の検証", () => {
  const topicKey = calendarTopic(2026, 9);

  it("正しい投稿は通る", () => {
    expect(
      validateCommentInput({ topicKey, body: "あ".repeat(COMMENT_MIN_LENGTH) }),
    ).toBeNull();
  });

  it("短すぎる本文は弾く", () => {
    const e = validateCommentInput({ topicKey, body: "短い" });
    expect(e?.field).toBe("body");
  });

  it("長すぎる本文は弾く", () => {
    const e = validateCommentInput({
      topicKey,
      body: "あ".repeat(COMMENT_MAX_LENGTH + 1),
    });
    expect(e?.field).toBe("body");
  });

  it("空白だけの本文は弾く", () => {
    const e = validateCommentInput({ topicKey, body: "   \n\t  " });
    expect(e?.field).toBe("body");
  });

  it("紐づけ先が不正なら本文を見る前に弾く", () => {
    const e = validateCommentInput({
      topicKey: "でたらめ",
      body: "十分な長さの本文です",
    });
    expect(e?.field).toBe("topicKey");
  });
});

describe("表示名", () => {
  it("プロフィール名があれば使う", () => {
    expect(displayNameFor("山田 太郎", "taro@example.com")).toBe("山田 太郎");
  });

  it("無ければメールアドレスの手前だけ。全体は出さない", () => {
    const shown = displayNameFor(null, "taro@example.com");
    expect(shown).toBe("taro");
    expect(shown).not.toContain("@");
    expect(shown).not.toContain("example.com");
  });

  it("空白だけの名前はメールアドレス側に落とす", () => {
    expect(displayNameFor("   ", "hanako@example.com")).toBe("hanako");
  });

  it("長い名前は切り詰める", () => {
    expect(displayNameFor("あ".repeat(200), "x@example.com").length).toBe(40);
  });
});

describe("頁そのものへの投稿（page: の鍵）", () => {
  /*
    足す前は、鍵が年 × 本命星 / 年 × 本命星 × 月 / 特定の月 / 地域コードの
    4 種類しか無く、**ナビが指す頁がどれにも当てはまらなかった。**

      ナビの行き先     /houi        /calendar
      投稿できる頁     /houi/2026/3 /calendar/2026-08

    ナビから入ると必ず投稿欄の無い頁に着くので、利用者からは
    「コメント機能が無い」ように見えていた（実際にそう報告があった）。
  */
  it("ナビが指す頁の鍵が作れる", () => {
    expect(pageTopic("/houi")).toBe("page:houi");
    expect(pageTopic("/calendar")).toBe("page:calendar");
    expect(pageTopic("/relocation/arbitrage")).toBe(
      "page:relocation-arbitrage",
    );
  });

  it("CORE_ROUTES の頁は全部そのまま通る", () => {
    for (const route of CORE_ROUTES) {
      const key = pageTopic(route.href);
      expect(isValidTopicKey(key), `${route.href} → ${key}`).toBe(true);
    }
  });

  it("鍵の一覧は CORE_ROUTES と同じ数（手で並べていない）", () => {
    expect(PAGE_TOPIC_KEYS.size).toBe(CORE_ROUTES.length);
  });

  it("形が合っていても、実在しない頁は通さない", () => {
    /*
      形だけ通すと page:anything で好きなだけ話題を作れてしまい、
      索引が効かず行数の見積もりも立たない。
    */
    expect(isValidTopicKey("page:not-a-real-page")).toBe(false);
    expect(isValidTopicKey("page:admin")).toBe(false);
  });

  it("消した頁の鍵も通らなくなる（投稿が積み続けない）", () => {
    // かつて存在し、siteStructure から削除された頁
    expect(isValidTopicKey("page:trends")).toBe(false);
    expect(isValidTopicKey("page:dashboard")).toBe(false);
  });

  it("大文字や記号は弾く", () => {
    expect(isValidTopicKey("page:Houi")).toBe(false);
    expect(isValidTopicKey("page:houi/2026")).toBe(false);
    expect(isValidTopicKey("page:")).toBe(false);
  });
});
