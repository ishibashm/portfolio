import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

/**
 * 地名を受け取る口が、どの画面にも付いていること。
 *
 * **`name` は省略できる引数なので、書き忘れても型は通る。**
 * `onChange={(lat, lon) => …}` は `(lat, lon, name?) => void` にそのまま
 * 代入できるし、`onChange={setBase}` も同じ。tsc は何も言わない。
 * 実際それで 3 か所が地名を捨てていた（2026-09-21）。だから字面で見張る。
 */
describe("PlaceInput の地名を落とさない", () => {
  /** 設定の座標（base_* / birth_*）を書く画面。ここは name が要る。 */
  const WRITERS = [
    "src/app/relocation/arbitrage/page.tsx",
    "src/components/layout/MetaphysicalConfigBar.tsx",
    "src/components/home/QuickProfileBar.tsx",
    "src/components/profile/ProfileForm.tsx",
  ];

  /**
   * 設定の `base_label` / `birth_label` を持たない画面。地名を捨てても
   * 誰かの登録内容とは食い違わない。
   */
  const NOT_WRITERS: Record<string, string> = {
    "src/components/relocation/PartyMembersEditor.tsx":
      "同行者の座標。設定の base_*/birth_* ではない",
    "src/app/relocation/appraisal/AppraisalForm.tsx":
      "査定の入力。設定に書かない",
    "src/components/home/DestinationMapPanel.tsx":
      "引越し先。destinationSetting が自分で地名を持つ",
    "src/app/relocation/simulator/page.tsx":
      "試算の各ステップの目的地。下書き（relocation_simulator_draft）にだけ持ち、onChange の名前を toName に入れる",
  };

  function read(rel: string): string {
    return readFileSync(join(process.cwd(), rel), "utf8")
      .split("\r\n")
      .join("\n");
  }

  it("見ている画面が実在する（空回りしていない）", () => {
    for (const rel of [...WRITERS, ...Object.keys(NOT_WRITERS)]) {
      expect(read(rel), rel).toContain("<PlaceInput");
    }
  });

  /** src の下の .tsx を全部。`node:fs` の glob は型に無いので自分で歩く。 */
  function tsxFiles(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(join(process.cwd(), dir), {
      withFileTypes: true,
    })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) out.push(...tsxFiles(rel));
      else if (e.name.endsWith(".tsx")) out.push(rel);
    }
    return out;
  }

  it("PlaceInput を置く画面が増えたら、ここに足す", () => {
    /*
      新しい画面が地名を捨てていないかは、人が決めるしかない（設定に
      書くのかどうかで変わる）。**数が合わなくなったら気付ける**ように
      しておく。
    */
    const found = tsxFiles("src").filter((f) =>
      read(f).includes("<PlaceInput"),
    );
    expect(found.sort()).toEqual(
      [...WRITERS, ...Object.keys(NOT_WRITERS)].sort(),
    );
  });

  it.each(WRITERS)("%s の onChange が name を受け取る", (rel) => {
    const src = read(rel);
    /* PlaceInput の onChange から、地名を捨てている書き方が消えていること */
    expect(src).not.toMatch(/onChange=\{\(\s*\w+,\s*\w+\s*\)\s*=>/);
    expect(src).toMatch(/\bname\b/);
  });
});
