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
 * 覚えていた目的地を戻したときは、そう言う。そして消せる。
 *
 * 開いた瞬間に点が入っていると、自分で入れた覚えが無いぶん何が起きたか
 * 分からない。札の先頭に「前回調べた地点を戻しました」を添える。
 *
 * 「× この地点を消す」は入力欄・札・ピンを消し、頁が覚えている目的地も
 * 消す（onClearTarget）。onTargetChange の null では消さない（開いた直後
 * にも null が来るので、戻す前に飛ばしてしまう）。
 */

const KYOTO = { lat: 35.0116, lon: 135.7681 };
const NAGOYA = { lat: 35.1815, lon: 136.9066 };

describe("戻した地点の断りと「× この地点を消す」", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("note を札の先頭に出し、消すと入力欄・札・断りが消えて頁に知らせる", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 404 }),
    );
    const onTargetChange = vi.fn();
    const onClearTarget = vi.fn();
    render(
      <SpotVerdict
        baseLat={KYOTO.lat}
        baseLon={KYOTO.lon}
        useClassical
        onTargetChange={onTargetChange}
        onClearTarget={onClearTarget}
        requestedPoint={{
          ...NAGOYA,
          seq: 1,
          name: "愛知県名古屋市中村区名駅1丁目",
          source: null,
          note: "前回調べた地点を戻しました。",
        }}
      />,
    );
    expect(
      await screen.findByText("前回調べた地点を戻しました。"),
    ).toBeTruthy();
    const input = screen.getByRole("textbox", {
      name: "物件URL・住所・座標から調べる",
    }) as HTMLInputElement;
    expect(input.value).toBe("愛知県名古屋市中村区名駅1丁目");
    /* 開いた直後の null では目的地を消さない */
    expect(onClearTarget).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "× この地点を消す" }));
    expect(onClearTarget).toHaveBeenCalledTimes(1);
    expect(input.value).toBe("");
    expect(screen.queryByText("前回調べた地点を戻しました。")).toBeNull();
    await waitFor(() =>
      expect(onTargetChange).toHaveBeenLastCalledWith(null, false),
    );
  });

  it("note の無い点（街の一覧・地図のクリック）には断りを出さない", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 404 }),
    );
    render(
      <SpotVerdict
        baseLat={KYOTO.lat}
        baseLon={KYOTO.lon}
        useClassical
        requestedPoint={{ ...NAGOYA, seq: 1, name: "愛知県名古屋市" }}
      />,
    );
    await screen.findByText(/街の代表点/);
    expect(screen.queryByText(/前回調べた地点/)).toBeNull();
  });
});

describe("物件検索の頁: 戻すときに断り、消すときに目的地も消す", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/relocation/arbitrage/page.tsx"),
    "utf8",
  );

  it("戻す setSpotRequest に note がある", () => {
    const m = src.match(/const dest = readDestination\(\);[\s\S]*?\}, \[\]\);/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/note: "前回調べた地点を戻しました/);
  });

  it("onClearTarget が目的地を空にする", () => {
    expect(src).toMatch(
      /onClearTarget=\{\(\) =>\s*writeDestination\(\{ lat: null, lon: null, label: "" \}\)\s*\}/,
    );
  });
});
