import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FloorPlanFengShui,
  exampleRooms,
} from "@/components/houi/FloorPlanFengShui";
import { FengShuiLookup } from "@/components/houi/FengShuiLookup";
import { buildFloorPlan } from "@/lib/floorPlanModel";
import { readFengShui } from "@/utils/fengShuiEngine";

/**
 * 自分の間取りで見る八宅（描く画面）。答えの精度は floorPlanModel.test が
 * 固定している。ここは画面が中身をそのまま写しているかと、下敷きの画像が
 * 端末の外へ出ないか。
 */

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

/* 1990 年生まれの女性（艮。記事と同じ例） */
const reading = readFengShui(1990, "female");

const resultCard = (id: string) =>
  document.querySelector(`li[data-result="${id}"]`) as HTMLElement;

describe("例の間取り", () => {
  it("部屋ごとの欠片の色と、結果の主な区画は中身のとおり", () => {
    const { container } = render(<FloorPlanFengShui reading={reading} />);
    const res = buildFloorPlan(
      { rooms: exampleRooms(), northArrowDeg: 0, centerMethod: "centroid" },
      reading,
    )!;
    for (const r of res.rooms) {
      const g = container.querySelector(`g[data-room="${r.room.id}"]`)!;
      const polys = g.querySelectorAll("polygon[data-direction]");
      expect(polys.length).toBe(r.shares.length);
      for (const s of r.shares) {
        const p = g.querySelector(`polygon[data-direction="${s.direction}"]`)!;
        expect(p.getAttribute("fill")).toBe(
          s.auspicious ? "#10b981" : "#e11d48",
        );
      }
      expect(resultCard(r.room.id)).toBeTruthy();
    }
    // 寝室は南西（艮命の生気）で、当て方に合う
    const bed = within(resultCard("ex-bed"));
    expect(bed.getByText(/^南西（生気）/)).toBeTruthy();
    expect(bed.getByText("当て方に合う")).toBeTruthy();
    // 浴室は北東（伏位・吉）で、水回りの当て方に合わない
    const bath = within(resultCard("ex-bath"));
    expect(bath.getByText(/^北東（伏位）/)).toBeTruthy();
    expect(bath.getByText("当て方に合わない")).toBeTruthy();
  });

  it("太極は描いた形の重心に置く", () => {
    const { container } = render(<FloorPlanFengShui reading={reading} />);
    const c = container.querySelector("circle[data-center]")!;
    expect(Number(c.getAttribute("cx"))).toBeCloseTo(6, 9);
    expect(Number(c.getAttribute("cy"))).toBeCloseTo(5, 9);
  });
});

describe("方位記号", () => {
  it("「右が北」にすると記号が回り、寝室は南東に移る", () => {
    const { container } = render(<FloorPlanFengShui reading={reading} />);
    fireEvent.click(screen.getByRole("button", { name: "右が北" }));
    expect(
      container.querySelector("g[data-north]")!.getAttribute("data-north"),
    ).toBe("90");
    // 図の左下 = 方位角 230 − 90 = 140 度 → 南東
    expect(within(resultCard("ex-bed")).getByText(/^南東/)).toBeTruthy();
  });
});

describe("部屋を直す", () => {
  it("結果から部屋を選び、種類を変えると当て方が変わる", () => {
    render(<FloorPlanFengShui reading={reading} />);
    fireEvent.click(within(resultCard("ex-bath")).getByRole("button"));
    const panel = screen.getByRole("group", { name: "選んだ部屋" });
    fireEvent.change(within(panel).getByLabelText("種類"), {
      target: { value: "bedroom" },
    });
    expect(
      within(resultCard("ex-bath")).getByText("当て方に合う"),
    ).toBeTruthy();
  });

  it("部屋を消すと L 字になり、中心の取り方で分かれる", () => {
    const { container } = render(<FloorPlanFengShui reading={reading} />);
    // 右下の玄関を消す
    fireEvent.click(within(resultCard("ex-ent")).getByRole("button"));
    fireEvent.click(screen.getByRole("button", { name: "この部屋を消す" }));
    expect(resultCard("ex-ent")).toBeNull();
    const c = container.querySelector("circle[data-center]")!;
    const cx = Number(c.getAttribute("cx"));
    fireEvent.click(
      screen.getByRole("button", { name: "欠けを補った四角形の中心" }),
    );
    const c2 = container.querySelector("circle[data-center]")!;
    expect(Number(c2.getAttribute("cx"))).toBeCloseTo(6, 9);
    expect(cx).toBeLessThan(6);
  });

  it("数で動かせる（ドラッグしなくても直せる）", () => {
    const { container } = render(<FloorPlanFengShui reading={reading} />);
    fireEvent.click(within(resultCard("ex-wc")).getByRole("button"));
    const panel = screen.getByRole("group", { name: "選んだ部屋" });
    fireEvent.change(within(panel).getByLabelText("左"), {
      target: { value: "0" },
    });
    const rect = container.querySelector(`g[data-room="ex-wc"] rect`)!;
    expect(rect.getAttribute("x")).toBe("0");
  });

  it("全部消すと区画は出さず、そう書く", () => {
    const { container } = render(<FloorPlanFengShui reading={reading} />);
    fireEvent.click(screen.getByRole("button", { name: "全部消す" }));
    expect(container.querySelector("circle[data-center]")).toBeNull();
    expect(screen.getByText(/部屋が 1 つも無いので/)).toBeTruthy();
  });
});

describe("下敷きの画像", () => {
  it("端末の中で表示するだけ（送らない・残さない）", () => {
    const create = vi.fn(() => "blob:local-plan");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container, unmount } = render(
      <FloorPlanFengShui reading={reading} />,
    );
    const file = new File(["x"], "plan.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("間取り図の画像"), {
      target: { files: [file] },
    });
    expect(create).toHaveBeenCalledWith(file);
    expect(container.querySelector("image")!.getAttribute("href")).toBe(
      "blob:local-plan",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:local-plan");
  });

  it("画面のコードに、外へ出す・残す経路が無い", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/houi/FloorPlanFengShui.tsx"),
      "utf8",
    );
    // 断りが画面にある
    expect(src).toMatch(/送信も保存もしません/);
    for (const w of [
      "fetch(",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "sendBeacon",
      "FormData",
    ]) {
      expect(src.includes(w), w).toBe(false);
    }
  });
});

describe("早見の中に置く", () => {
  it("生まれ年と性別を入れると、例の間取りの下に出る", () => {
    render(<FengShuiLookup />);
    expect(screen.queryByLabelText("自分の間取りで見る八宅")).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("1990"), {
      target: { value: "1990" },
    });
    fireEvent.click(screen.getByRole("button", { name: "女性" }));
    expect(screen.getByLabelText("自分の間取りで見る八宅")).toBeTruthy();
  });
});
