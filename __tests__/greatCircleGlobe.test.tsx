import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  FlatGlobe,
  GLOBE_RANGE_KM,
  GreatCircleGlobe,
} from "@/components/houi/GreatCircleGlobe";
import { boundaryLines, classifyCities } from "@/lib/globeModel";
import { MUNICIPALITY_POINTS } from "@/lib/municipalityCoords";
import { PREFECTURE_CENTERS } from "@/lib/prefectureDirection";
import { sectorRange } from "@/lib/threeBoardModel";
import { COMPASS_DIRECTIONS } from "@/utils/directionGeo";
import type { QuickFindArea } from "@/components/houi/AreaQuickFind";

/**
 * 地球儀の節（/houi/area）。jsdom には WebGL が無いので平面の図（正距方位
 * 図法）が出る。中身の精度は globeModel.test が固定している。ここは図と
 * 文言が中身を写しているか。
 */

afterEach(cleanup);

const AREAS: QuickFindArea[] = MUNICIPALITY_POINTS.slice(0, 400).map((m) => [
  m.code,
  m.code.slice(0, 2),
  `${m.pref}${m.city}`,
  m.lat,
  m.lon,
]);

function pathPoints(d: string): [number, number][] {
  return [...d.matchAll(/[ML] ([-\d.]+) ([-\d.]+)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
}

/**
 * 中心 (200,200) からの向きの幅（度）。直線なら 0。座標は 0.01px に
 * 丸めて書いてあるので、中心のすぐ近く（40px 未満）は向きが荒れる。除く
 */
function angularSpread(pts: [number, number][]): number {
  const as = pts
    .filter(([x, y]) => Math.hypot(x - 200, y - 200) > 40)
    .map(([x, y]) => (Math.atan2(x - 200, 200 - y) * 180) / Math.PI);
  return Math.max(...as) - Math.min(...as);
}

describe("平面の図（正距方位図法）", () => {
  const origin = PREFECTURE_CENTERS["東京都"];
  const data = {
    origin,
    wedges: COMPASS_DIRECTIONS.map((direction) => {
      const [start, end] = sectorRange(direction, "traditional");
      return { direction, start, end };
    }),
    lines: boundaryLines(origin, "traditional", GLOBE_RANGE_KM),
    cities: classifyCities(
      origin,
      AREAS.map(([code, , name, lat, lon]) => ({ code, name, lat, lon })),
      "traditional",
    ),
    rangeKm: GLOBE_RANGE_KM,
  };

  it("大圏の境目は中心からの直線、地図の直線（等角航路）は曲がる", () => {
    const { container } = render(<FlatGlobe data={data} />);
    let bent = 0;
    for (let i = 0; i < 8; i++) {
      const gc = pathPoints(
        container.querySelector(`[data-gc-line="${i}"]`)!.getAttribute("d")!,
      );
      expect(angularSpread(gc)).toBeLessThan(0.01);
      const rh = pathPoints(
        container.querySelector(`[data-rhumb-line="${i}"]`)!.getAttribute("d")!,
      );
      if (angularSpread(rh) > 0.5) bent++;
    }
    expect(bent).toBe(8);
  });

  it("街の点の色は判定の方位", () => {
    const { container } = render(<FlatGlobe data={data} />);
    for (const c of data.cities) {
      const dot = container.querySelector(`[data-city="${c.code}"]`)!;
      expect(dot.getAttribute("data-direction")).toBe(c.direction);
    }
  });
});

describe("地球儀の節", () => {
  it("食い違う街の数と例を、判定（大圏）と地図の直線の方位で出す", () => {
    render(<GreatCircleGlobe areas={AREAS} />);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "北海道" },
    });
    const origin = PREFECTURE_CENTERS["北海道"];
    const cities = classifyCities(
      origin,
      AREAS.map(([code, , name, lat, lon]) => ({ code, name, lat, lon })),
      "traditional",
    );
    const n = cities.filter((c) => c.differs).length;
    expect(screen.getByTestId("globe-summary").textContent).toBe(
      `北海道から見ると、一覧の ${cities.length} エリアのうち ${n} エリアが、地図に直線を引くと隣の方位に見えます。`,
    );
  });
});
