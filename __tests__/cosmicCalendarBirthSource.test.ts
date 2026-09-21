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

  it("設定に無ければ旧キーから引き上げて読む（直には読まない）", () => {
    /*
      旧キー（wealth_*）を直に読むのはやめた。`readSettingsSync` が正の
      設定へ引き上げたうえで返すので、この経路が生きていることを見る。
      直に読んでいると、別の端末で消した生年月日をこの画面だけが拾い直す。
    */
    localStorage.setItem("wealth_birthDate", "1985-02-04T05:00");
    localStorage.setItem("wealth_birthLon", "139.7");
    expect(readBirthConfig()).toEqual({
      birthDate: "1985-02-04T05:00",
      birthLon: "139.7",
    });
  });

  it("別の端末で消した生年月日は、旧キーがあっても戻らない", () => {
    /*
      旧キーを直に読んでいたころは、消したはずの生年月日をこの画面だけが
      拾い直していた。引き上げは「消された欄」（_cleared）を見るので戻らない。
    */
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ _cleared: "birth_date" }),
    );
    localStorage.setItem("wealth_birthDate", "1985-02-04T05:00");
    expect(readBirthConfig().birthDate).toBe("");
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
    persistBirthConfig("birth_date", "1990-05-15T12:00");
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
    expect(saved.birth_date).toBe("1990-05-15T12:00");
    /* 旧キーには書かない（2026-09-21）。写しを再生産しない */
    expect(localStorage.getItem("wealth_birthDate")).toBeNull();
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("/api/user-config");
    expect(JSON.parse(call[1].body)).toEqual({
      birth_date: "1990-05-15T12:00",
    });
  });

  it("経度は数値として設定に書き、数値でなければ設定には書かない", () => {
    persistBirthConfig("birth_lon", "135.5");
    expect(
      JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}").birth_lon,
    ).toBe(135.5);
    localStorage.removeItem(SETTINGS_KEY);
    persistBirthConfig("birth_lon", "abc");
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
  });

  it("空にしても設定は消さない（消す操作はプロフィールで行う）", () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ birth_date: "1990-05-15T12:00" }),
    );
    persistBirthConfig("birth_date", "");
    expect(
      JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}").birth_date,
    ).toBe("1990-05-15T12:00");
  });
});
