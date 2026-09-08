import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  persistBirthConfig,
  readBirthConfig,
} from "@/components/widgets/CosmicCalendar";
import { SETTINGS_KEY } from "@/lib/userSettings";

/**
 * /calendar の暦は、生年月日を**設定（tactical_config_v1）**から読み、
 * 直した値を設定へ書く。
 *
 * 以前は旧 wealth_birthDate / wealth_birthLon だけを読み書きしていた。
 * /profile・設定バー・ホームの簡易プロフィールは tactical_config_v1 と
 * クラウドに書くので、そこで登録した人が /calendar を開くと「未設定」で
 * 設定欄が開き、ここで入れ直した値は他の画面に伝わらず、同じ人が
 * 画面ごとに違う生年月日で判定されていた。
 */

describe("CosmicCalendar の生年月日の読み書き", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("設定にあれば旧キーが無くても読める", () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ birth_date: "1990-05-15T12:00", birth_lon: 135.5 }),
    );
    expect(readBirthConfig()).toEqual({
      birthDate: "1990-05-15T12:00",
      birthLon: "135.5",
    });
  });

  it("設定に無ければ旧キーを読む（ホームの手動保存がまだ書く）", () => {
    localStorage.setItem("wealth_birthDate", "1985-02-04T05:00");
    localStorage.setItem("wealth_birthLon", "139.7");
    expect(readBirthConfig()).toEqual({
      birthDate: "1985-02-04T05:00",
      birthLon: "139.7",
    });
  });

  it("両方あれば設定が勝つ", () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ birth_date: "1990-05-15T12:00" }),
    );
    localStorage.setItem("wealth_birthDate", "1985-02-04T05:00");
    expect(readBirthConfig().birthDate).toBe("1990-05-15T12:00");
  });

  it("直した生年月日は設定（端末とクラウド）に書かれる", () => {
    persistBirthConfig("wealth_birthDate", "1990-05-15T12:00");
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
    expect(saved.birth_date).toBe("1990-05-15T12:00");
    // 旧キーも残す
    expect(localStorage.getItem("wealth_birthDate")).toBe("1990-05-15T12:00");
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("/api/user-config");
    expect(JSON.parse(call[1].body)).toEqual({
      birth_date: "1990-05-15T12:00",
    });
  });

  it("経度は数値として設定に書き、数値でなければ設定には書かない", () => {
    persistBirthConfig("wealth_birthLon", "135.5");
    expect(
      JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}").birth_lon,
    ).toBe(135.5);
    localStorage.removeItem(SETTINGS_KEY);
    persistBirthConfig("wealth_birthLon", "abc");
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
  });

  it("空にしても設定は消さない（消す操作はプロフィールで行う）", () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ birth_date: "1990-05-15T12:00" }),
    );
    persistBirthConfig("wealth_birthDate", "");
    expect(
      JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}").birth_date,
    ).toBe("1990-05-15T12:00");
  });
});
