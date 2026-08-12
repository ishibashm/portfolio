import { describe, expect, it } from "vitest";
import { toLogMessage, toUserMessage } from "@/lib/errorMessage";

describe("画面に出すエラー文言", () => {
  it("ブラウザの英語をそのまま出さない", () => {
    // 移住先を比べる画面で、通信を落とすと赤帯に "Failed to fetch" と
    // 出ていた。何が起きたのか、次に何をすればよいのかが伝わらない。
    for (const raw of [
      "Failed to fetch",
      "NetworkError when attempting to fetch resource.",
      "Load failed",
      "Network request failed",
      "The user aborted a request.",
    ]) {
      const msg = toUserMessage(new Error(raw));
      expect(msg, raw).toContain("通信に失敗");
      expect(msg, raw).not.toContain(raw);
    }
  });

  it("サーバが日本語で返した説明はそのまま使う", () => {
    const msg = "対象の市区町村が見つかりませんでした";
    expect(toUserMessage(new Error(msg))).toBe(msg);
  });

  it("見慣れない英語は既定の日本語に置き換える", () => {
    const msg = toUserMessage(new Error("ECONNRESET xyz"));
    expect(msg).toContain("データの取得に失敗");
    expect(msg).not.toContain("ECONNRESET");
  });

  it("空・null・数値でも文言が出る", () => {
    for (const v of [new Error(""), null, undefined, 42, {}]) {
      const msg = toUserMessage(v);
      expect(msg.length, String(v)).toBeGreaterThan(5);
      expect(/[぀-ヿ一-龯]/.test(msg), String(v)).toBe(true);
    }
  });

  it("文字列で渡されても扱える", () => {
    expect(toUserMessage("Failed to fetch")).toContain("通信に失敗");
    expect(toUserMessage("保存に失敗しました")).toBe("保存に失敗しました");
  });

  it("既定の文言は差し替えられる", () => {
    expect(toUserMessage(new Error("weird"), "独自の文言")).toBe("独自の文言");
  });

  it("出力に英語の生メッセージが混ざらない", () => {
    for (const v of ["Failed to fetch", "TypeError: x is not a function", ""]) {
      expect(toUserMessage(new Error(v))).not.toMatch(/[A-Za-z]{6,}/);
    }
  });
});

/**
 * ログ側は画面と逆で、**加工しない**のが正しい。原因を追う人が読むので、
 * 英語のままでも生のメッセージが要る。toUserMessage と取り違えると
 * ログから "Failed to fetch" が消えて原因が分からなくなる。
 */
describe("ログに出すエラー文言", () => {
  it("Error はメッセージをそのまま出す（日本語に置き換えない）", () => {
    expect(toLogMessage(new Error("Failed to fetch"))).toBe("Failed to fetch");
    expect(toLogMessage(new Error("P2037 too many clients"))).toBe(
      "P2037 too many clients",
    );
  });

  it("Error 以外でも読める文字列になる", () => {
    // `catch (e: any) { log(e.message) }` の頃はここが undefined になり、
    // 何が投げられたのか分からないログが残っていた。
    expect(toLogMessage("just a string")).toBe("just a string");
    expect(toLogMessage(42)).toBe("42");
    expect(toLogMessage(null)).toBe("null");
    expect(toLogMessage(undefined)).toBe("undefined");
    expect(toLogMessage({ code: "P2037" })).toBe("[object Object]");
  });

  it("画面用の文言とは別物である", () => {
    const err = new Error("Failed to fetch");
    expect(toLogMessage(err)).not.toBe(toUserMessage(err));
  });
});
