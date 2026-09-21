import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { savePlacePoint, writePlaceLabel } from "@/lib/placePoint";
import { describePlace } from "@/lib/placeLabel";
import {
  readSettingsSync,
  saveSettings,
  settingNumber,
  settingString,
} from "@/lib/userSettings";

/**
 * 地名（`base_label` / `birth_label`）が、座標に**付いてくる**こと。
 *
 * ## 何が壊れていたか（2026-09-21 に判明）
 *
 * `PlaceInput` は `onChange(lat, lon, name?)` で地名も渡し、props の説明に
 * 「**前の地名を残さないこと。**座標だけ変わって名前が残ると、別の場所に
 * 前の地名が付いたまま画面に出る」と書いてある。それでも第 3 引数を
 * 受け取っていたのは `/profile` のフォームだけで、街探し・設定バー・
 * ホームの欄は落としていた。
 *
 * `ActiveProfileBadge` は `base_label` を**最優先**で読み、地名がある
 * ときは座標からの逆引き（`resolvePlaceName`）を呼ばない。だから古い
 * 地名は上書きされずに勝ち続ける。
 *
 * 判定は座標で決まるので**答えは合っている。**隣に出る地名だけが別の街。
 *
 * ## ここで固定すること
 *
 * 名前つきで保存すれば地名も変わる。**名前が無ければ欄ごと消える**
 * （現在地ボタン・緯度経度の直接入力）。跡に `null` を置かない（#1423）。
 */

const SETTINGS_KEY = "tactical_config_v1";

/* 札幌市中央区 → 福岡市。実在の市区町村だが、利用者の登録内容ではない。 */
const SAPPORO = { lat: 43.0618, lon: 141.3545, name: "札幌市中央区" };
const FUKUOKA = { lat: 33.5902, lon: 130.4017, name: "福岡市中央区" };

describe("地名は座標に付いてくる", () => {
  beforeEach(() => {
    localStorage.clear();
    /* saveSettings は座標をクラウドへ送る。未ログインの 401 と同じ扱い */
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 401 })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("地名で選び直すと、地名も座標も入れ替わる", async () => {
    await savePlacePoint("base", SAPPORO.lat, SAPPORO.lon, SAPPORO.name);
    await savePlacePoint("base", FUKUOKA.lat, FUKUOKA.lon, FUKUOKA.name);

    const s = readSettingsSync();
    expect(settingString(s, "base_label")).toBe(FUKUOKA.name);
    expect(settingNumber(s, "base_lat")).toBe(FUKUOKA.lat);
  });

  it("名前が無ければ地名は欄ごと消える（現在地ボタン・座標の直接入力）", async () => {
    await savePlacePoint("base", SAPPORO.lat, SAPPORO.lon, SAPPORO.name);
    await savePlacePoint("base", FUKUOKA.lat, FUKUOKA.lon);

    const s = readSettingsSync();
    expect(settingString(s, "base_label")).toBeUndefined();
    /* 跡に null を置かない。素の JSON を手で読む画面が落ちる（#1423） */
    const raw: Record<string, unknown> = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) ?? "{}",
    );
    expect("base_label" in raw).toBe(false);
  });

  it("**これが変えたところ。**座標だけ書くと、前の街の名前が残る", async () => {
    /*
      直す前の書き方（座標だけ saveSettings に流す）をそのまま写す。
      画面に出る 1 行まで作って、何が見えていたかを固定する。
    */
    await savePlacePoint("base", SAPPORO.lat, SAPPORO.lon, SAPPORO.name);
    await saveSettings({ base_lat: FUKUOKA.lat, base_lon: FUKUOKA.lon });

    const stale = readSettingsSync();
    expect(settingString(stale, "base_label")).toBe(SAPPORO.name);
    /* 福岡の座標に、札幌の名前が付いて出ていた */
    expect(
      describePlace(
        settingNumber(stale, "base_lat"),
        settingNumber(stale, "base_lon"),
        settingString(stale, "base_label"),
        null,
      ),
    ).toBe(SAPPORO.name);

    /* 直したあとの書き方なら、同じ操作で名前も入れ替わる */
    await savePlacePoint("base", FUKUOKA.lat, FUKUOKA.lon, FUKUOKA.name);
    const fixed = readSettingsSync();
    expect(
      describePlace(
        settingNumber(fixed, "base_lat"),
        settingNumber(fixed, "base_lon"),
        settingString(fixed, "base_label"),
        null,
      ),
    ).toBe(FUKUOKA.name);
  });

  it("出発地と出生地は別の欄（片方を変えても、もう片方は動かない）", async () => {
    await savePlacePoint("base", SAPPORO.lat, SAPPORO.lon, SAPPORO.name);
    await savePlacePoint("birth_place", FUKUOKA.lat, FUKUOKA.lon, FUKUOKA.name);

    const s = readSettingsSync();
    expect(settingString(s, "base_label")).toBe(SAPPORO.name);
    expect(settingString(s, "birth_label")).toBe(FUKUOKA.name);
    expect(settingNumber(s, "birth_lat")).toBe(FUKUOKA.lat);
    expect(settingNumber(s, "base_lat")).toBe(SAPPORO.lat);
  });

  it("地名だけを書いても、座標は巻き添えにしない", async () => {
    await savePlacePoint("base", SAPPORO.lat, SAPPORO.lon, SAPPORO.name);
    writePlaceLabel("base", "札幌市（別の書き方）");

    const s = readSettingsSync();
    expect(settingString(s, "base_label")).toBe("札幌市（別の書き方）");
    expect(settingNumber(s, "base_lat")).toBe(SAPPORO.lat);
    expect(settingNumber(s, "base_lon")).toBe(SAPPORO.lon);
  });

  it("端末だけの欄なので、クラウドとの比較時刻を地名では進めない", async () => {
    /*
      `_savedAt` は同期する項目を書いたときだけ進む。地名は
      SYNCED_FIELDS に入っていないので、単独で書いても進まない
      （進めると別の端末で消した生年月日を追い越す。#1420 の穴）。
    */
    writePlaceLabel("base", SAPPORO.name);
    const raw: Record<string, unknown> = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) ?? "{}",
    );
    expect(raw._savedAt).toBeUndefined();
  });
});
