import { beforeEach, describe, expect, it } from "vitest";
import {
  isWorkingDate,
  readWorkingDate,
  saveWorkingDate,
} from "@/lib/workingDate";

/**
 * 「引っ越し時期を選んだのに物件を地図で探す段階になったら選んだ時期が
 * 消えていた」という利用者報告の検証。
 *
 * 選んだ日は targetDate をクエリに載せた特定のリンクを通ったときだけ
 * 保存されていた。手引きの手順 5・カレンダーの CTA・サイドバーから
 * スキャナーへ入ると、保存されていないので今日に戻っていた。
 *
 * 保存先が 2 つある（旧キーと新しい設定）ので、片方だけに書くと
 * 端末の状態次第で拾えない。両方に書くことをここで固定する。
 */

const LEGACY_KEY = "arb_targetDate";
const CONFIG_KEY = "tactical_config_v1";

beforeEach(() => {
  localStorage.clear();
});

describe("isWorkingDate", () => {
  it("YYYY-MM-DD だけ通す", () => {
    expect(isWorkingDate("2026-11-08")).toBe(true);
    expect(isWorkingDate("2026-11-8")).toBe(false);
    expect(isWorkingDate("2026/11/08")).toBe(false);
    expect(isWorkingDate("")).toBe(false);
    expect(isWorkingDate(null)).toBe(false);
    expect(isWorkingDate(20261108)).toBe(false);
  });
});

describe("saveWorkingDate", () => {
  it("旧キーと新しい設定の両方に書く", () => {
    expect(saveWorkingDate("2026-11-08")).toBe(true);
    expect(localStorage.getItem(LEGACY_KEY)).toBe("2026-11-08");
    expect(JSON.parse(localStorage.getItem(CONFIG_KEY)!)).toMatchObject({
      target_date: "2026-11-08",
    });
  });

  it("既にある設定の他の項目を消さない", () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ birth_date: "1957-09-22", use_classical_board: true }),
    );
    saveWorkingDate("2026-11-08");
    expect(JSON.parse(localStorage.getItem(CONFIG_KEY)!)).toEqual({
      birth_date: "1957-09-22",
      use_classical_board: true,
      target_date: "2026-11-08",
    });
  });

  it("設定が壊れていても日付は残る", () => {
    localStorage.setItem(CONFIG_KEY, "{壊れている");
    expect(saveWorkingDate("2026-11-08")).toBe(true);
    expect(readWorkingDate()).toBe("2026-11-08");
  });

  it("形の違う値では何もしない（前の日付を壊さない）", () => {
    saveWorkingDate("2026-11-08");
    expect(saveWorkingDate("あした")).toBe(false);
    expect(saveWorkingDate("2026/12/01")).toBe(false);
    expect(readWorkingDate()).toBe("2026-11-08");
  });
});

describe("readWorkingDate", () => {
  it("何も無ければ null", () => {
    expect(readWorkingDate()).toBeNull();
  });

  it("新しい設定を優先して読む", () => {
    localStorage.setItem(LEGACY_KEY, "2026-01-01");
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ target_date: "2026-11-08" }),
    );
    expect(readWorkingDate()).toBe("2026-11-08");
  });

  it("新しい設定が無ければ旧キーに落ちる", () => {
    localStorage.setItem(LEGACY_KEY, "2026-11-08");
    expect(readWorkingDate()).toBe("2026-11-08");
  });

  it("設定に日付が入っていなければ旧キーに落ちる", () => {
    localStorage.setItem(LEGACY_KEY, "2026-11-08");
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ birth_date: "1957-09-22" }),
    );
    expect(readWorkingDate()).toBe("2026-11-08");
  });

  it("壊れた値が入っていたら null（黙って変な日で判定しない）", () => {
    localStorage.setItem(LEGACY_KEY, "きのう");
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ target_date: 20261108 }));
    expect(readWorkingDate()).toBeNull();
  });
});

describe("報告された流れの再現", () => {
  it("日を選んでおけば、リンクを通らずに開いても残っている", () => {
    // /calendar か /timing で日を選ぶ
    saveWorkingDate("2026-11-08");
    // 手引きの手順 5 やサイドバーから、クエリ無しでスキャナーへ
    expect(readWorkingDate()).toBe("2026-11-08");
  });

  it("選んでいなければ null。呼び出し側が今日に落とす", () => {
    expect(readWorkingDate()).toBeNull();
  });
});
