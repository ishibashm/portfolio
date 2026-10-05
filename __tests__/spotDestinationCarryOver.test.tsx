import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SpotVerdict } from "@/components/relocation/SpotVerdict";

/**
 * 「方位で街を探す」で調べた地点を、目的地として持ち回る。
 *
 * 利用者の求め（2026-09-28〜）「設定した値がページ遷移したらまた設定
 * しないといけない」「再設定しなくてもいいように」。住所を入れて調べた
 * 点は頁の state にしか無く、開き直すと消えていた。
 *
 * 置き場は lib/destinationSetting（/profile・今日の方位と時刻と同じ。
 * **端末だけ**でクラウドには送らない。あちらの検査が固定している）。
 *
 *   - 調べた点は目的地として書く（地名つき。座標だけの点は地名を空に）
 *   - 開いたとき、覚えていた目的地があれば調べる地点として戻す。
 *     住所で決めた点なので「代表点です」の断りは出さない
 */

const KYOTO = { lat: 35.0116, lon: 135.7681 };
const NAGOYA = { lat: 35.1815, lon: 136.9066 };

describe("SpotVerdict: 目的地から戻した点と、頁へ知らせる名前", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("source: null で戻した点には「代表点」の断りを出さず、地名をそのまま知らせる", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 404 }),
    );
    const onTargetChange = vi.fn();
    render(
      <SpotVerdict
        baseLat={KYOTO.lat}
        baseLon={KYOTO.lon}
        useClassical
        onTargetChange={onTargetChange}
        requestedPoint={{
          lat: NAGOYA.lat,
          lon: NAGOYA.lon,
          seq: 1,
          name: "愛知県名古屋市中村区名駅1丁目",
          source: null,
        }}
      />,
    );
    await waitFor(() =>
      expect(onTargetChange).toHaveBeenLastCalledWith(
        {
          lat: NAGOYA.lat,
          lon: NAGOYA.lon,
          name: "愛知県名古屋市中村区名駅1丁目",
        },
        true,
      ),
    );
    expect(screen.queryByText(/街の代表点/)).toBeNull();
    /* 名前だけで source を省いたときは今までどおり代表点（街の一覧） */
    cleanup();
    render(
      <SpotVerdict
        baseLat={KYOTO.lat}
        baseLon={KYOTO.lon}
        useClassical
        requestedPoint={{
          lat: NAGOYA.lat,
          lon: NAGOYA.lon,
          seq: 1,
          name: "愛知県名古屋市",
        }}
      />,
    );
    expect(await screen.findByText(/街の代表点/)).toBeTruthy();
  });

  it('座標だけの点は地名を空で知らせる（"35.1, 136.9" を地名として覚えない）', async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 404 }),
    );
    const onTargetChange = vi.fn();
    render(
      <SpotVerdict
        baseLat={KYOTO.lat}
        baseLon={KYOTO.lon}
        useClassical
        onTargetChange={onTargetChange}
      />,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "物件URL・住所・座標から調べる" }),
      { target: { value: `${NAGOYA.lat}, ${NAGOYA.lon}` } },
    );
    fireEvent.click(screen.getByRole("button", { name: "調べる" }));
    await waitFor(() =>
      expect(onTargetChange).toHaveBeenLastCalledWith(
        { lat: NAGOYA.lat, lon: NAGOYA.lon, name: "" },
        false,
      ),
    );
  });
});

describe("物件検索の頁: 目的地と結ぶ", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/relocation/arbitrage/page.tsx"),
    "utf8",
  );

  it("調べた点を目的地として書く（クラウドへは送らない置き場）", () => {
    expect(src).toContain(
      'import { readDestination, writeDestination } from "@/lib/destinationSetting";',
    );
    const m = src.match(
      /const onSpotTargetChange = useCallback\([\s\S]*?\n  \);/,
    );
    expect(m).not.toBeNull();
    expect(m![0]).toContain("writeDestination({");
    expect(m![0]).toContain("label: target.name");
  });

  it("開いたとき、覚えていた目的地を調べる地点として戻す（保存済み候補を開いているときは除く）", () => {
    const m = src.match(/const dest = readDestination\(\);[\s\S]*?\}, \[\]\);/);
    expect(m).not.toBeNull();
    expect(m![0]).toContain("setSpotRequest({");
    expect(m![0]).toContain("source: null");
    expect(src).toContain('has("candidate")');
  });
});
