import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  FlatCompass,
  MagneticCompass,
} from "@/components/houi/MagneticCompass";
import { buildCompassModel } from "@/lib/compassModel";
import { bearingOfPoint } from "@/lib/threeBoardModel";
import { normalizeBearing } from "@/utils/directionGeo";

/**
 * 羅盤の節（/houi）。jsdom には WebGL が無いので平面の図が出る。中身の精度は
 * compassModel.test が固定している。ここは図が中身の角度を写しているかと、
 * 文言が判定（真北）と測った値（磁北）を取り違えていないか。
 */

afterEach(cleanup);

const TOKYO = { name: "東京都", lat: 35.6895, lon: 139.6917 };
const OSAKA = { name: "大阪府", lat: 34.6937, lon: 135.5023 };

/** SVG の線（中心 200,200 から外へ）が指す方位角 */
function lineBearing(el: Element): number {
  const x1 = Number(el.getAttribute("x1"));
  const y1 = Number(el.getAttribute("y1"));
  const x2 = Number(el.getAttribute("x2"));
  const y2 = Number(el.getAttribute("y2"));
  // 絵の上が北、右が東。盤の上の座標（x, z）と同じ向き
  return bearingOfPoint(x2 - x1, y2 - y1);
}

function close(a: number, b: number) {
  return Math.abs(normalizeBearing(a - b + 180) - 180) < 1e-6;
}

describe("平面の羅盤", () => {
  const model = buildCompassModel(TOKYO, -7.94, OSAKA);

  it("磁針は偏角ぶん西を指す", () => {
    const { container } = render(<FlatCompass model={model} />);
    const b = lineBearing(container.querySelector("[data-needle]")!);
    expect(close(b, 360 - 7.94)).toBe(true);
  });

  it("実線は真北の境目、点線は磁北で切った境目", () => {
    const { container } = render(<FlatCompass model={model} />);
    for (const s of model.sectors) {
      const edge = container.querySelector(`[data-edge="${s.direction}"]`)!;
      expect(close(lineBearing(edge), s.startDeg)).toBe(true);
      const mag = container.querySelector(`[data-mag-edge="${s.direction}"]`)!;
      expect(close(lineBearing(mag), s.magStartDeg)).toBe(true);
      expect(close(s.magStartDeg - s.startDeg, -7.94)).toBe(true);
    }
  });

  it("目的地の糸は真北の方位角", () => {
    const { container } = render(<FlatCompass model={model} />);
    const b = lineBearing(container.querySelector("[data-target]")!);
    expect(close(b, model.target!.trueBearing)).toBe(true);
  });
});

describe("羅盤の節", () => {
  it("東京都 → 大阪府: 判定は真北の南西、方位磁針では西に見える", () => {
    render(<MagneticCompass />);
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "東京都" } });
    fireEvent.change(selects[1], { target: { value: "大阪府" } });
    expect(screen.getByTestId("declination").textContent).toMatch(
      /^東京都では、磁北は真北から西へ \d\.\d 度ずれています。$/,
    );
    expect(screen.getByText(/南西（このサイトの判定）/)).toBeTruthy();
    expect(
      screen.getByText(
        "方位磁針で測ると隣の方位（西）に見えます。判定は真北の南西です。",
      ),
    ).toBeTruthy();
  });

  it("均等（45°）に切り替えると、区切りも判定と同じ規則になる", () => {
    const { container } = render(<MagneticCompass />);
    fireEvent.click(screen.getByRole("button", { name: "均等（45°）" }));
    const n = container.querySelector('[data-edge="N"]')!;
    expect(close(lineBearing(n), 337.5)).toBe(true);
  });
});
