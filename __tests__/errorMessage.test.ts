import { describe, expect, it } from "vitest";
import {
  errorCode,
  toLogMessage,
  toResponseMessage,
  toUserMessage,
} from "@/lib/errorMessage";

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

/**
 * API の応答本文に入れる文言。`error.message || "既定"` の置き換えなので、
 * **旧コードと同じ結果になること**が要。
 */
describe("応答に入れるエラー文言", () => {
  const FB = "Failed to save config";
  /**
   * 置き換え前の書き方。同じ答えになることをここで突き合わせる。
   * 元は `catch (e: any)` の e だが、ここで any を足すと警告が増えるので、
   * 読んでいた枝（message）だけの形にしてある。
   */
  const old = (e: { message?: string }) => e.message || FB;

  it("Error のメッセージはそのまま使う", () => {
    expect(toResponseMessage(new Error("unique constraint"), FB)).toBe(
      "unique constraint",
    );
  });

  it("メッセージが空の Error は既定に落ちる", () => {
    expect(toResponseMessage(new Error(""), FB)).toBe(FB);
  });

  it("Error 以外は既定に落ちる（素の値を応答に混ぜない）", () => {
    // toLogMessage を使うとここが "[object Object]" になり、応答が汚れる。
    for (const v of [null, undefined, 42, "text", {}, { code: "P2037" }]) {
      expect(toResponseMessage(v, FB), String(v)).toBe(FB);
    }
    expect(toLogMessage({})).toBe("[object Object]");
  });

  it("旧コードと同じ答えになる", () => {
    for (const e of [new Error("boom"), new Error(""), { message: "" }]) {
      expect(toResponseMessage(e, FB), String(e)).toBe(old(e));
    }
  });
});

/**
 * `e.code === "ENOENT"` のような分岐を `catch (e: any)` 無しで書くための取り出し。
 * ここは**ログではなく制御**に使うので、取れなかったときに何が起きるかが要。
 */
describe("投げられたものから code を取り出す", () => {
  it("Node の fs や Prisma が付ける code を取れる", () => {
    const enoent = Object.assign(new Error("no such file"), {
      code: "ENOENT",
    });
    expect(errorCode(enoent)).toBe("ENOENT");
    // Prisma は Error の派生に code を持たせてくる。
    expect(errorCode({ code: "P2037", message: "too many clients" })).toBe(
      "P2037",
    );
  });

  it("code が無いものは undefined（どの比較にも一致しない）", () => {
    // `e.code === "ENOENT"` と書いていた頃と同じ結果になることが要点。
    for (const v of [new Error("plain"), null, undefined, 42, "text", {}]) {
      expect(errorCode(v), String(v)).toBeUndefined();
    }
  });

  it("code が文字列でないものは拾わない", () => {
    // 数値の errno を code と取り違えると、比較が静かに外れる。
    expect(errorCode({ code: 2 })).toBeUndefined();
    expect(errorCode({ code: null })).toBeUndefined();
  });
});
