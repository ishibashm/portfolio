import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  GUIDE_FORM_TOKEN_MAX_AGE_MS,
  GUIDE_FORM_TOKEN_MIN_AGE_MS,
  GUIDE_SESSION_MAX_SEALED,
  GUIDE_SESSION_MAX_TURNS,
  GUIDE_SESSION_MEMO_CHARS,
  GUIDE_SESSION_RECENT_MAX,
  GUIDE_SESSION_TTL_MS,
  appendGuideTurn,
  checkFormToken,
  guideSessionKey,
  openGuideSession,
  sealFormToken,
  sealGuideSession,
  type GuideSessionPayload,
} from "@/lib/guide/guideSession";

const KEY_1 = randomBytes(32);
const KEY_2 = randomBytes(32);
const NOW = 1_800_000_000_000;

describe("guideSession: 鍵の検証とラウンドトリップ", () => {
  it("GUIDE_SESSION_KEY は32バイトのbase64のみ受け入れ、未設定や長さ不一致は null を返す", () => {
    expect(guideSessionKey({})).toBeNull();
    expect(guideSessionKey({ GUIDE_SESSION_KEY: "   " })).toBeNull();
    expect(
      guideSessionKey({
        GUIDE_SESSION_KEY: randomBytes(16).toString("base64"),
      }),
    ).toBeNull();
    expect(
      guideSessionKey({ GUIDE_SESSION_KEY: "not-valid-base64!!!" }),
    ).toBeNull();

    const validKey = guideSessionKey({
      GUIDE_SESSION_KEY: KEY_1.toString("base64"),
    });
    expect(validKey).not.toBeNull();
    expect(validKey?.equals(KEY_1)).toBe(true);
  });

  it("空文字列・未指定は none、正常な封印は ok で往復できる", () => {
    expect(openGuideSession(undefined, KEY_1, NOW)).toEqual({ status: "none" });
    expect(openGuideSession("", KEY_1, NOW)).toEqual({ status: "none" });

    const s1 = appendGuideTurn(
      null,
      {
        q: "五黄殺とは何ですか？",
        a: "「方位の基本」によると五黄土星が巡る凶方位です。",
        slugs: ["houi-kihon"],
      },
      NOW,
    );
    const sealed = sealGuideSession(s1, KEY_1);
    const opened = openGuideSession(sealed, KEY_1, NOW + 10_000);
    expect(opened.status).toBe("ok");
    if (opened.status === "ok") {
      expect(opened.session).toEqual(s1);
    }
  });

  it("改ざん・別鍵・フォームトークン混入は例外を投げず invalid を返す", () => {
    const s1 = appendGuideTurn(
      null,
      { q: "質問1", a: "回答1", slugs: ["post-1"] },
      NOW,
    );
    const sealed = sealGuideSession(s1, KEY_1);

    // 復号後のバイトを改ざんする（base64url の末尾文字だけだと、
    // 余ったビットが無視されて同じ平文に戻ることがある）
    const sealedBytes = Buffer.from(sealed, "base64url");
    sealedBytes[sealedBytes.length - 1] ^= 0xff;
    const tampered = sealedBytes.toString("base64url");
    expect(openGuideSession(tampered, KEY_1, NOW)).toEqual({
      status: "invalid",
    });

    // 別鍵
    expect(openGuideSession(sealed, KEY_2, NOW)).toEqual({
      status: "invalid",
    });

    // AAD purpose が異なる formToken を session として開こうとした場合も invalid
    const ft = sealFormToken(KEY_1, NOW);
    expect(openGuideSession(ft, KEY_1, NOW)).toEqual({
      status: "invalid",
    });
  });

  it("最後の送信から2時間（GUIDE_SESSION_TTL_MS）で expired になる", () => {
    const s1 = appendGuideTurn(
      null,
      { q: "質問1", a: "回答1", slugs: [] },
      NOW,
    );
    const sealed = sealGuideSession(s1, KEY_1);

    expect(
      openGuideSession(sealed, KEY_1, NOW + GUIDE_SESSION_TTL_MS - 1).status,
    ).toBe("ok");
    expect(
      openGuideSession(sealed, KEY_1, NOW + GUIDE_SESSION_TTL_MS).status,
    ).toBe("expired");
  });

  it("8問に達したセッションは full を返し、古い質問は先頭40文字が memo に畳まれ直近4問が recent に残る", () => {
    let current: GuideSessionPayload | null = null;
    for (let i = 1; i <= GUIDE_SESSION_MAX_TURNS; i++) {
      const longQ = `第${i}問目_${"あ".repeat(60)}`;
      current = appendGuideTurn(
        current,
        {
          q: longQ,
          a: `回答${i}`,
          slugs: [`slug-${i}`],
        },
        NOW + i * 1_000,
      );
    }

    expect(current!.turns).toBe(GUIDE_SESSION_MAX_TURNS);
    expect(current!.recent).toHaveLength(GUIDE_SESSION_RECENT_MAX);
    expect(current!.memo).toHaveLength(
      GUIDE_SESSION_MAX_TURNS - GUIDE_SESSION_RECENT_MAX,
    );
    for (const m of current!.memo) {
      expect(m.length).toBeLessThanOrEqual(GUIDE_SESSION_MEMO_CHARS);
    }
    expect(current!.memo[0]).toBe(`第1問目_${"あ".repeat(60)}`.slice(0, 40));
    expect(current!.recent.map((r) => r.a)).toEqual([
      "回答5",
      "回答6",
      "回答7",
      "回答8",
    ]);

    const sealed = sealGuideSession(current!, KEY_1);
    const opened = openGuideSession(sealed, KEY_1, NOW + 10_000);
    expect(opened.status).toBe("full");
  });

  it("長い回答が続いても封印後の文字列を 8192 バイト以下に収める", () => {
    let current: GuideSessionPayload | null = null;
    for (let i = 1; i <= 7; i++) {
      current = appendGuideTurn(
        current,
        {
          q: `質問${i}_${"い".repeat(50)}`,
          a: `長文回答${i}_${"う".repeat(3500)}`,
          slugs: ["long-article-slug"],
        },
        NOW + i * 1_000,
      );
    }
    const sealed = sealGuideSession(current!, KEY_1);
    expect(Buffer.byteLength(sealed, "utf8")).toBeLessThanOrEqual(
      GUIDE_SESSION_MAX_SEALED,
    );

    const opened = openGuideSession(sealed, KEY_1, NOW + 10_000);
    expect(opened.status).toBe("ok");
  });
});

describe("guideSession: フォームトークン（ボット連打・期限切れ防止）", () => {
  it("2秒未満は too_young、2時間以上は expired、2秒〜2時間未満は ok、改ざんは invalid", () => {
    const token = sealFormToken(KEY_1, NOW);

    expect(
      checkFormToken(token, KEY_1, NOW + GUIDE_FORM_TOKEN_MIN_AGE_MS - 1),
    ).toEqual({
      ok: false,
      reason: "too_young",
    });

    expect(
      checkFormToken(token, KEY_1, NOW + GUIDE_FORM_TOKEN_MIN_AGE_MS),
    ).toEqual({
      ok: true,
    });

    expect(
      checkFormToken(token, KEY_1, NOW + GUIDE_FORM_TOKEN_MAX_AGE_MS - 1),
    ).toEqual({
      ok: true,
    });

    expect(
      checkFormToken(token, KEY_1, NOW + GUIDE_FORM_TOKEN_MAX_AGE_MS),
    ).toEqual({
      ok: false,
      reason: "expired",
    });

    expect(
      checkFormToken(token, KEY_2, NOW + GUIDE_FORM_TOKEN_MIN_AGE_MS),
    ).toEqual({
      ok: false,
      reason: "invalid",
    });

    expect(
      checkFormToken("", KEY_1, NOW + GUIDE_FORM_TOKEN_MIN_AGE_MS),
    ).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});
