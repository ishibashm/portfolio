import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { screenBearing } from "@/lib/threeBoardCanvas";
import {
  buildThreeBoardModel,
  type ThreeBoardModel,
} from "@/lib/threeBoardModel";
import { FlatBoard } from "@/components/relocation/ThreeBoardStack";
import { GET } from "@/app/api/relocation/auspicious-days/route";

/**
 * 三盤の方位盤の「南を上」（利用者の依頼、2026-09-30）。
 *
 * 気学の本の方位盤は南を上に描く。地図を 180 度**回した**もので、裏返し
 * ではない。南が上なら東は左・西は右・北は下。方位の割り当てと判定は
 * 変わらず、見る向きだけが変わる。
 */

afterEach(cleanup);

describe("画面の上からの角度", () => {
  it("北を上ならそのまま", () => {
    for (let b = 0; b < 360; b += 15) expect(screenBearing(b, "north")).toBe(b);
  });

  it("南を上なら 180 度回す（裏返さない）", () => {
    const top = (b: number) => ((screenBearing(b, "south") % 360) + 360) % 360;
    expect(top(180)).toBe(0); // 南が上
    expect(top(90)).toBe(270); // 東が左
    expect(top(270)).toBe(90); // 西が右
    expect(top(0)).toBe(180); // 北が下
  });
});

describe("平面の盤", () => {
  let model: ThreeBoardModel;
  beforeAll(async () => {
    const q = new URLSearchParams({
      mode: "board",
      date: "2026-09-30",
      birthDate: "1990-05-10",
      lon: "139.69",
    });
    const res = await GET(
      new Request(`http://localhost/api/relocation/auspicious-days?${q}`),
    );
    model = buildThreeBoardModel(await res.json(), "traditional");
  });

  /** 段階の字（外周の輪）の位置。盤の中心は (200, 200) */
  function tierPos(container: HTMLElement, dir: string): [number, number] {
    const t = container.querySelector(`text[data-direction="${dir}"]`)!;
    return [Number(t.getAttribute("x")), Number(t.getAttribute("y"))];
  }

  it("北を上: 北が上・東が右、上の字は「北」", () => {
    const { container, getByText } = render(
      <FlatBoard model={model} selected={null} onSelect={() => {}} />,
    );
    const [nx, ny] = tierPos(container, "N");
    const [ex, ey] = tierPos(container, "E");
    expect(nx).toBeCloseTo(200, 6);
    expect(ny).toBeLessThan(200);
    expect(ex).toBeGreaterThan(200);
    expect(ey).toBeCloseTo(200, 6);
    expect(getByText("北")).toBeTruthy();
  });

  it("南を上: 南が上・東が左・北が下、上の字は「南」", () => {
    const { container, getByText } = render(
      <FlatBoard
        model={model}
        selected={null}
        onSelect={() => {}}
        orientation="south"
      />,
    );
    const [sx, sy] = tierPos(container, "S");
    const [ex, ey] = tierPos(container, "E");
    const [nx, ny] = tierPos(container, "N");
    expect(sx).toBeCloseTo(200, 6);
    expect(sy).toBeLessThan(200);
    expect(ex).toBeLessThan(200);
    expect(ey).toBeCloseTo(200, 6);
    expect(nx).toBeCloseTo(200, 6);
    expect(ny).toBeGreaterThan(200);
    expect(getByText("南")).toBeTruthy();
  });

  it("向きを変えても、扇形の星と段階は同じ方位のまま", () => {
    const north = render(
      <FlatBoard model={model} selected={null} onSelect={() => {}} />,
    );
    const texts = (el: HTMLElement) =>
      [...el.querySelectorAll("text[data-direction]")]
        .map((t) => `${t.getAttribute("data-direction")}:${t.textContent}`)
        .sort();
    const a = texts(north.container);
    north.unmount();
    const south = render(
      <FlatBoard
        model={model}
        selected={null}
        onSelect={() => {}}
        orientation="south"
      />,
    );
    expect(texts(south.container)).toEqual(a);
    expect(a).toHaveLength(8);
  });
});
