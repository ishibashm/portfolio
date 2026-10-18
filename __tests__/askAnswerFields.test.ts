import { describe, expect, it } from "vitest";
import {
  askAnswerFields,
  explicitConsultationDate,
} from "@/lib/askAnswerFields";
import { dedupeAskMemories, parseAskWorkspace } from "@/lib/askData";
import { sanitizeFollowUpSuggestions } from "@/lib/followUpSuggestions";

describe("回答ボタンは利用者の値だけで決める", () => {
  const person = {
    birthDate: "1990-04-15",
    origin: { lat: 35.1709, lon: 136.8815 },
  };
  it("プロフィールで計算済みでも未指定の期間だけを示す", () => {
    expect(askAnswerFields("引越しの日付と方位を相談したい", [person])).toEqual(
      ["period"],
    );
    expect(
      askAnswerFields("引越し。時期は1〜3か月後を考えています。", [person]),
    ).toEqual([]);
    expect(
      askAnswerFields("引越し。時期はまだ決めていません。", [person]),
    ).toEqual([]);
  });
  it("不足順で最大3項目、一般的な説明には出さない", () => {
    expect(askAnswerFields("引越し先の街の候補")).toEqual([
      "birthYear",
      "origin",
      "period",
    ]);
    expect(askAnswerFields("街を探したい", [person])).toEqual(["conditions"]);
    expect(askAnswerFields("引越しとは")).toEqual([]);
    expect(
      askAnswerFields("引越し", [{ birthDate: person.birthDate }]),
    ).toEqual(["origin", "period"]);
  });
  it("本文や道具結果の既知の値を聞き返さない", () => {
    expect(
      askAnswerFields(
        "生年月日は1990-04-15です。出発地は名古屋市です。引越しは2026-12-01ごろです。",
      ),
    ).toEqual([]);
    expect(
      askAnswerFields(
        "街の候補",
        [{ birthDate: person.birthDate }],
        [
          {
            tool: "search_municipality",
            input: {},
            output: { results: [{ name: "名古屋市" }] },
          },
        ],
      ),
    ).toEqual(["conditions"]);
  });
  it("生年月日を計算日と取り違えず、最新の明示日を使う", () => {
    expect(
      explicitConsultationDate("1990年4月15日生まれです。引越し相談です。"),
    ).toBeUndefined();
    expect(
      explicitConsultationDate(
        "引越しは2026-12-01。時期は2027年1月2日ごろです。",
      ),
    ).toBe("2027-01-02");
  });
});
it("候補は疑問形を捨て、依頼文に疑問符を付けない", () => {
  expect(
    sanitizeFollowUpSuggestions([
      "南東の街を3つ教えて",
      "来月の吉日を詳しく見たい",
      "どちらですか",
      "時期を教えてください",
      "現在のお住まいはどちらですか？",
      "未定?",
    ]),
  ).toEqual(["南東の街を3つ教えて", "来月の吉日を詳しく見たい"]);
});
it("別の会話の同じ記憶もNFKCと空白でまとめ、読み込み時にも除く", () => {
  const now = "2026-10-18T00:00:00.000Z";
  const memories = ["Ａ　Ｂ\n相談", "A B 相談", "別の相談"].map((text, i) => ({
    id: `m${i}`,
    sourceConversationId: `c${i}`,
    text,
    createdAt: now,
    updatedAt: now,
  }));
  expect(dedupeAskMemories(memories).map((m) => m.id)).toEqual(["m0", "m2"]);
  expect(
    parseAskWorkspace({
      version: 2,
      conversations: [{ id: "c0", messages: [] }],
      memories,
    })?.memories,
  ).toHaveLength(2);
});
