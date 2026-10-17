import { describe, expect, it } from "vitest";
import {
  ASK_DATA_STORAGE_KEY,
  LEGACY_ASK_STORAGE_KEY,
  mergeRegisteredAskPeople,
  parseAskWorkspace,
  readLocalAskWorkspace,
  summarizeConsultation,
} from "@/lib/askData";

function memoryStorage(values: Record<string, string>) {
  const data = new Map(Object.entries(values));
  return {
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
    removeItem(key: string) {
      data.delete(key);
    },
  };
}

describe("AI相談データ", () => {
  it("旧い単一会話とプロフィールを複数会話形式へ移し、相談メモも作る", () => {
    const storage = memoryStorage({
      [LEGACY_ASK_STORAGE_KEY]: JSON.stringify({
        version: 1,
        messages: [
          {
            role: "user",
            content: "2026年11月に長崎市から東へ引越したい",
          },
          { role: "assistant", content: "東の候補と11月5日を比較しました。" },
        ],
        profile: {
          birthDate: "1990-05-05",
          residence: "長崎市",
          fromSaved: true,
        },
        draft: "続きを相談",
      }),
    });

    const migrated = readLocalAskWorkspace(storage, "2026-10-17T00:00:00.000Z");

    expect(migrated).toMatchObject({
      version: 2,
      conversations: [
        expect.objectContaining({
          title: "2026年11月に長崎市から東へ引越したい",
          draft: "続きを相談",
          personIds: ["legacy_person"],
        }),
      ],
      people: [
        expect.objectContaining({
          name: "本人",
          birthDate: "1990-05-05",
          residence: "長崎市",
        }),
      ],
      memories: [
        expect.objectContaining({
          text: expect.stringContaining("11月5日"),
        }),
      ],
    });
    expect(storage.getItem(LEGACY_ASK_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(ASK_DATA_STORAGE_KEY)).toContain('"version":2');
  });

  it("相談の問いと回答を短い引継ぎメモにする", () => {
    const summary = summarizeConsultation(
      ["家族3人で北東へ動きたい", "2027年3月10日に決めます"],
      "**結論**：北東と3月10日を候補として、通勤条件も確認してください。",
    );
    expect(summary).toContain("家族3人で北東");
    expect(summary).toContain("2027年3月10日");
    expect(summary).toContain("北東と3月10日");
    expect(summary).not.toContain("**");
  });

  it("長い質問が続いても回答の結論を相談メモに残す", () => {
    const summary = summarizeConsultation(
      ["前提".repeat(100), "条件".repeat(100), "比較".repeat(100)],
      "結論は2027年3月10日の北東です。" + "補足".repeat(100),
    );
    expect(summary).toContain("主な回答・結論：");
    expect(summary).toContain("2027年3月10日の北東");
    expect(summary.length).toBeLessThanOrEqual(600);
  });

  it("壊れた人物を落とし、会話の選択からも外す", () => {
    const parsed = parseAskWorkspace(
      {
        version: 2,
        activeConversationId: "conversation_1",
        updatedAt: "2026-10-17T00:00:00.000Z",
        conversations: [
          {
            id: "conversation_1",
            title: "相談",
            createdAt: "2026-10-17T00:00:00.000Z",
            updatedAt: "2026-10-17T00:00:00.000Z",
            messages: [],
            draft: "",
            personIds: ["valid_person", "missing_person"],
          },
        ],
        people: [
          {
            id: "valid_person",
            name: "本人",
            birthDate: "1990-05-05",
            createdAt: "2026-10-17T00:00:00.000Z",
            updatedAt: "2026-10-17T00:00:00.000Z",
          },
          { id: "bad id", name: "壊れた人物" },
        ],
        memories: [],
      },
      "2026-10-17T00:00:00.000Z",
    );
    expect(parsed?.people.map((person) => person.id)).toEqual(["valid_person"]);
    expect(parsed?.conversations[0].personIds).toEqual(["valid_person"]);
  });

  it("/ask の人物と登録プロフィール・同行者を重複なく統合する", () => {
    const now = "2026-10-17T00:00:00.000Z";
    const current = [
      {
        id: "person_existing",
        name: "本人",
        birthDate: "1991-04-12",
        residence: "浜松市中央区",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const merged = mergeRegisteredAskPeople(
      current,
      [
        {
          sourceId: "profile:active",
          name: "自分",
          birthDate: "1991-04-12",
          residence: "静岡県浜松市中央区",
          active: true,
        },
        {
          sourceId: "party:me",
          name: "本人",
          birthDate: "1991-04-12",
        },
        {
          sourceId: "profile:partner",
          name: "配偶者",
          birthDate: "1991-04-02",
          residence: "静岡県浜松市中央区",
        },
      ],
      now,
    );

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      id: "person_existing",
      name: "自分",
      birthDate: "1991-04-12",
      residence: "静岡県浜松市中央区",
      sourceIds: ["profile:active", "party:me"],
      active: true,
      updatedAt: now,
    });
    expect(merged[1]).toMatchObject({
      name: "配偶者",
      sourceIds: ["profile:partner"],
    });
    expect(current[0]).not.toHaveProperty("sourceIds");
    expect(current[0].name).toBe("本人");
  });
});

describe("停止・失敗した相談を記憶しない", () => {
  it.each([
    "しるべのAI回答は、いま一時的にお休みしています。",
    "AI回答の利用枠が一時的に止まっています。",
    "本日のAI回答の枠が終わりました。",
    "回答に必要な結果を取得できませんでした。",
    "エラーが発生しました。",
    "本日のAI無料枠に達しました。計算のみの方式をご利用ください。",
  ])("旧データの結論も除外する: %s", (answer) => {
    expect(summarizeConsultation(["引越したい"], answer)).toBe("");
    const workspace = parseAskWorkspace({
      version: 2,
      conversations: [{ id: "c", messages: [] }],
      memories: [
        {
          id: "m",
          sourceConversationId: "c",
          text: `相談内容：引越したい\n主な回答・結論：${answer}`,
        },
      ],
    });
    expect(workspace?.memories).toEqual([]);
  });
  it("停止についての質問を正常な結論と混同しない", () => {
    expect(
      summarizeConsultation(
        ["AI回答の利用枠が一時的に止まっていますか？"],
        "本命星は三碧木星です。",
      ),
    ).not.toBe("");
  });
});
