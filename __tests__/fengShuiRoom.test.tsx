import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FengShuiRoom, FlatRoom } from "@/components/houi/FengShuiRoom";
import { FengShuiLookup } from "@/components/houi/FengShuiLookup";
import { buildRoomModel } from "@/lib/fengShuiRoomModel";
import { readFengShui } from "@/utils/fengShuiEngine";

/**
 * 八宅の間取り（立体と平面）。jsdom には WebGL が無いので平面の図が出る。
 * 立体と平面は同じ中身（fengShuiRoomModel）を描く。中身の精度は
 * fengShuiRoomModel.test が固定している。ここは見せ方が中身を写しているか。
 */

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

/* 1990 年生まれの男性（公開の例示。記事と同じ例） */
const reading = readFengShui(1990, "male");
const model = buildRoomModel(reading);

describe("平面の間取り", () => {
  it("家具は中身の位置に、前の向きへ回して置く", () => {
    const { container } = render(
      <FlatRoom model={model} selection={null} onSelect={() => {}} />,
    );
    const S = 400 / (2 * model.half);
    for (const it of model.items) {
      const g = container.querySelector(`g[data-item="${it.kind}"]`)!;
      const m = g
        .getAttribute("transform")!
        .match(/translate\(([-\d.]+) ([-\d.]+)\) rotate\(([-\d.]+)\)/)!;
      expect(Number(m[1])).toBeCloseTo((it.x + model.half) * S, 6);
      expect(Number(m[2])).toBeCloseTo((it.z + model.half) * S, 6);
      expect(Number(m[3])).toBe(it.facingDeg);
    }
  });

  it("区画の色は本命卦の吉凶", () => {
    const { container } = render(
      <FlatRoom model={model} selection={null} onSelect={() => {}} />,
    );
    for (const d of reading.directions) {
      const poly = container.querySelector(
        `polygon[data-direction="${d.direction}"]`,
      )!;
      expect(poly.getAttribute("fill")).toBe(
        d.auspicious ? "#10b981" : "#e11d48",
      );
    }
  });
});

describe("間取りの節", () => {
  it("記事の例のとおり（坎命: ベッドは南・延年で頭を東・天医へ）", () => {
    render(<FengShuiRoom reading={reading} />);
    expect(screen.getByText(/坎命の家に/)).toBeTruthy();
    expect(
      screen.getByText("南（延年）の区画に置き、頭を東（天医）へ"),
    ).toBeTruthy();
    expect(screen.getByText(/このサイトの判定ではありません/)).toBeTruthy();
  });

  it("区画を押すと、その遊星の意味が出る", () => {
    const { container } = render(<FengShuiRoom reading={reading} />);
    fireEvent.click(container.querySelector('polygon[data-direction="SW"]')!);
    expect(screen.getByText("南西の区画")).toBeTruthy();
    expect(screen.getByText("八宅でもっとも避ける方位")).toBeTruthy();
  });

  it("早見で生まれ年と性別を入れると、表の下に間取りが出る", () => {
    render(<FengShuiLookup />);
    expect(screen.queryByLabelText("八宅の間取り")).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("1990"), {
      target: { value: "1990" },
    });
    fireEvent.click(screen.getByRole("button", { name: "女性" }));
    expect(screen.getByLabelText("八宅の間取り")).toBeTruthy();
    expect(screen.getByText(/艮命の家に/)).toBeTruthy();
  });
});
