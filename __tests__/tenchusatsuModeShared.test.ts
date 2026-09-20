import { describe, expect, it, beforeEach } from "vitest";
import {
  AXIS_PREFS_KEY,
  LEGACY_PROFILE_KEYS,
  legacyProfilePatch,
} from "@/lib/legacyProfileKeys";
import {
  readSettingsSync,
  settingBoolean,
  settingString,
  writeLocalSettings,
  type Settings,
} from "@/lib/userSettings";
import { evaluateTenchusatsu } from "@/utils/tenchusatsuPolicy";

/**
 * 天中殺の扱いが、街探しから時期ツールへ伝わること。
 *
 * ## 何が壊れていたか（2026-09-20 に判明）
 *
 * 街探し（`/relocation/arbitrage`）は「天中殺の扱い」と「やむを得ない
 * 移動」を **`arb_axis_prefs_v1` という自分の塊にだけ**書いていた。
 * 時期ツール（`/relocation/timing`）は正の設定の `tenchusatsu_mode` /
 * `involuntary_move` を読む。**どこもその欄に書いていない**ので、時期
 * ツールは利用者が何を選んでいても既定（`strict`）で走っていた。
 *
 * 画面はそうなっていると書いていなかった。時期ツールの冒頭は「街探しの
 * 設定（生年月日・出発地・天中殺の扱い）をそのまま使います」、街探しの
 * コメントは「時期ツールと同じ鍵の同じ項目」。記事 3 本も共有だと書いて
 * いる（tenchusatsu-and-lucky-directions / tenchusatsu-origin-and-
 * what-not-to-do / who-decided-the-prohibitions）。
 *
 * ## 直し方
 *
 * 1. 街探しは正の設定へ書く（`writeLocalSettings`）
 * 2. 旧い塊しか持っていない端末は、引き上げ（`liftAxisPrefs`）が拾う
 *
 * 時期ツールは変えていない（元から正の設定を読んでいる）。
 *
 * ## 判定の答えが変わる
 *
 * `off` を選んでいた人の時期ツールは、これまで `strict` で走っていた。
 * 下の「答えが変わる」がその差で、**引き上げを外すと落ちる**。
 */

const SETTINGS_KEY = "tactical_config_v1";

function flatKeys() {
  return LEGACY_PROFILE_KEYS.map(([key]) => key);
}

/** 直す前の引き上げ。平らな鍵の表だけを見ていて、塊を読まなかった。 */
function legacyPatchBeforeFix(
  values: Record<string, string>,
  current: Settings,
): Settings {
  const flat: Record<string, string> = {};
  for (const key of flatKeys()) if (key in values) flat[key] = values[key];
  return legacyProfilePatch(
    { getItem: (k) => (k in flat ? flat[k] : null) },
    current,
  );
}

describe("天中殺の扱いが街探しから時期ツールへ伝わる", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("旧い塊しか無い端末から、正の設定へ引き上がる", () => {
    const values: Record<string, string> = {
      [AXIS_PREFS_KEY]: JSON.stringify({
        tenchusatsuMode: "off",
        involuntaryMove: true,
        /* 同行者も同じ塊に入っている。巻き添えで拾わないこと。 */
        partyMembers: [{ name: "同行者", birthDate: "2000-01-01T00:00" }],
      }),
    };
    const patch = legacyProfilePatch(
      { getItem: (k: string) => values[k] ?? null },
      {},
    );

    expect(patch.tenchusatsu_mode).toBe("off");
    expect(patch.involuntary_move).toBe(true);
    /* 塊の他の中身は正の設定へ持ち込まない */
    expect(patch.partyMembers).toBeUndefined();

    /* 直す前はここが undefined だった。**これが変えたところ。** */
    const before = legacyPatchBeforeFix(values, {});
    expect(before.tenchusatsu_mode).toBeUndefined();
    expect(before.involuntary_move).toBeUndefined();
  });

  it("時期ツールが読む欄に、街探しの保存がそのまま入る", () => {
    /*
      街探しの保存（writeLocalSettings）と、時期ツールの読み取り
      （readSettingsSync + settingString）をそのまま繋いで確かめる。
    */
    writeLocalSettings({
      tenchusatsu_mode: "month_day",
      involuntary_move: true,
    });

    const read = readSettingsSync();
    expect(settingString(read, "tenchusatsu_mode")).toBe("month_day");
    expect(settingBoolean(read, "involuntary_move")).toBe(true);
  });

  it("端末だけの欄なので、クラウドとの比較時刻を進めない", () => {
    /*
      `_savedAt` を進めると「クラウドより新しい保存」と見なされ、別の端末で
      消した生年月日を追い越して復活させる（#1420 の穴）。天中殺の扱いは
      SYNCED_FIELDS に入っていないので、ここは進んではいけない。
    */
    writeLocalSettings({ tenchusatsu_mode: "off", involuntary_move: false });
    const raw = localStorage.getItem(SETTINGS_KEY) ?? "{}";
    expect(JSON.parse(raw)._savedAt).toBeUndefined();
  });

  it("正の設定に値があれば、旧い塊で上書きしない", () => {
    const patch = legacyProfilePatch(
      {
        getItem: (k: string) =>
          k === AXIS_PREFS_KEY
            ? JSON.stringify({ tenchusatsuMode: "off", involuntaryMove: true })
            : null,
      },
      { tenchusatsu_mode: "day_only", involuntary_move: false },
    );
    expect(patch.tenchusatsu_mode).toBeUndefined();
    expect(patch.involuntary_move).toBeUndefined();
  });

  it("知らない綴りは入れない（時期ツールは検めずに走査へ渡す）", () => {
    const patch = legacyProfilePatch(
      {
        getItem: (k: string) =>
          k === AXIS_PREFS_KEY
            ? JSON.stringify({ tenchusatsuMode: "きびしめ" })
            : null,
      },
      {},
    );
    expect(patch.tenchusatsu_mode).toBeUndefined();
  });

  it("壊れた塊は既定のまま（例外にしない）", () => {
    const patch = legacyProfilePatch(
      { getItem: (k: string) => (k === AXIS_PREFS_KEY ? "{壊れ" : null) },
      {},
    );
    expect(patch.tenchusatsu_mode).toBeUndefined();
  });

  it("答えが変わる。off を選んだ人は空亡で塞がらなくなる", () => {
    /*
      伝わっていなかったあいだ、時期ツールは常に strict で走っていた。
      同じ日・同じ空亡でも、設定が伝わると判定が反転する。
    */
    const scopes = { year: true, month: false, day: false };
    expect(evaluateTenchusatsu(scopes, "strict").blocks).toBe(true);
    expect(evaluateTenchusatsu(scopes, "off").blocks).toBe(false);
    expect(evaluateTenchusatsu(scopes, "month_day").blocks).toBe(false);
  });
});
