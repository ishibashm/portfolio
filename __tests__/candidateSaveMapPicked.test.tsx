import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CandidateSave } from "@/components/relocation/CandidateSave";
import type { SpotTarget } from "@/components/relocation/SpotVerdict";

/**
 * 候補の保存（CandidateSave）の入口の手間。
 *
 * 1. 地図で指した点（クリック・ピンを引きずった）は、もう地図で見ている。
 *    「地図で所在地を確認する」を押さなくても印を付けられる。住所で引いた
 *    点は従来どおり、押してから
 * 2. 街の代表点（source: "municipality"）は保存できない。その理由を
 *    「生年月日・対象日・出発地を設定し…」ではなく、代表点だからと言う
 */

const context = {
  birthDate: "1990-01-10",
  targetDate: "2026-11-08",
  baseLat: "35.0116",
  baseLon: "135.7681",
  tenchusatsuMode: "strict",
  involuntaryMove: false,
  directionFilterMode: "composite",
  useClassical: true,
} as const;

const NAGOYA = { lat: 35.1815, lon: 136.9066 };

function renderSave(target: SpotTarget) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ count: 0 })),
  );
  return render(
    <CandidateSave
      target={target}
      context={context}
      url=""
      memo=""
      ready
      title=""
      onTitleChange={() => {}}
    />,
  );
}

const confirmBox = () =>
  screen.getByRole("checkbox", {
    name: /地図の所在地を確認しました/,
  }) as HTMLInputElement;

describe("候補の保存: 入口の手間", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("地図で指した点は、地図を開かなくても印を付けられる", () => {
    renderSave({ ...NAGOYA, name: "35.1815, 136.9066", inputSource: "pin" });
    expect(confirmBox().disabled).toBe(false);
    /* 次にすることを言う（「状態: 位置確認」では段階の名前でしかなかった） */
    expect(screen.getByText("下の印を付けると保存できます。")).toBeTruthy();
    fireEvent.click(confirmBox());
    expect(confirmBox().checked).toBe(true);
    expect(screen.getByText("この内容で保存できます。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "候補に保存" })).toBeEnabled();
  });

  it("住所で引いた点は、地図で確かめてから（押すまで印は付けられない）", () => {
    const onFocus = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ count: 0 })),
    );
    render(
      <CandidateSave
        target={{
          ...NAGOYA,
          name: "愛知県名古屋市中村区名駅1丁目",
          source: "gsi",
        }}
        context={context}
        url=""
        memo=""
        ready
        title=""
        onTitleChange={() => {}}
        onFocus={onFocus}
      />,
    );
    expect(confirmBox().disabled).toBe(true);
    expect(
      screen.getByText("地図で所在地を確かめて印を付けると保存できます。"),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "地図で所在地を確認する" }),
    );
    expect(onFocus).toHaveBeenCalledWith(NAGOYA.lat, NAGOYA.lon);
    expect(confirmBox().disabled).toBe(false);
  });

  it("街の代表点は保存できず、理由を代表点だからと言う", () => {
    renderSave({
      ...NAGOYA,
      name: "愛知県名古屋市",
      source: "municipality",
      inputSource: "pin",
    });
    expect(confirmBox().disabled).toBe(true);
    expect(
      screen.getByText(/街の代表点は候補として保存できません/),
    ).toBeTruthy();
    expect(screen.queryByText(/生年月日・対象日・出発地を設定し/)).toBeNull();
  });
});
