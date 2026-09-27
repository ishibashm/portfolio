import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

/**
 * 移住先比較の地図（WealthMap）で寄れること（利用者の指摘、2026-09-28、
 * iPad「地図でフォーカスしようとしてもできない」）。
 *
 * ZoomableGroup は中身を SVG の scale でまとめて拡大するので、点の半径と
 * 「現在地」の文字も同じ倍率で大きくなり、拡大すると点が地図を覆って
 * いた。倍率で割って画面上の大きさを保つ。ボタンでも寄れるようにし、
 * 指で押しても吹き出しが出るようにする。
 */

const zoomProps = vi.hoisted(() => ({
  last: null as null | Record<string, unknown>,
}));
vi.mock("react-simple-maps", () => ({
  ComposableMap: ({ children }: { children: React.ReactNode }) => (
    <svg>{children}</svg>
  ),
  Geographies: () => null,
  Geography: () => null,
  ZoomableGroup: (props: { children: React.ReactNode }) => {
    zoomProps.last = props as unknown as Record<string, unknown>;
    return <g>{props.children}</g>;
  },
  Marker: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <g data-testid="marker" onClick={onClick}>
      {children}
    </g>
  ),
}));

import { WealthMap } from "@/components/WealthMap";

/* 公開の代表点（京都・名古屋）。値は架空 */
const data = [
  {
    id: "1",
    areaName: "架空市",
    incomePerCapita: 3_000_000,
    lat: 35.1815,
    lon: 136.9066,
    astrologyStatus: "OPTIMAL",
    direction: "東",
    magneticDirection: "東",
  },
] as never[];

beforeEach(() => {
  zoomProps.last = null;
});

const radii = () =>
  /* 凡例の見本（別の svg）は拡大されないので除く */
  Array.from(document.querySelector("svg")!.querySelectorAll("circle")).map(
    (c) => Number(c.getAttribute("r")),
  );

it("最初の中心は出発地で、倍率 1", () => {
  render(<WealthMap data={data} baseLat={35.0116} baseLon={135.7681} />);
  expect(zoomProps.last?.center).toEqual([135.7681, 35.0116]);
  expect(zoomProps.last?.zoom).toBe(1);
});

it("拡大しても点と「現在地」の画面上の大きさは変わらない", () => {
  render(<WealthMap data={data} baseLat={35.0116} baseLon={135.7681} />);
  const before = radii();
  const label = () =>
    (screen.getByText("現在地") as unknown as SVGTextElement).style.fontSize;
  expect(label()).toBe("10px");
  const onMoveEnd = zoomProps.last?.onMoveEnd as (p: {
    coordinates: [number, number];
    zoom: number;
  }) => void;
  act(() => onMoveEnd({ coordinates: [136, 35], zoom: 4 }));
  /* SVG の scale(4) が掛かるので、1/4 にして元の見た目に戻す */
  expect(radii()).toEqual(before.map((r) => r / 4));
  expect(label()).toBe("2.5px");
  /* 手で動かした位置と倍率を保つ（元に戻さない） */
  expect(zoomProps.last?.center).toEqual([136, 35]);
  expect(zoomProps.last?.zoom).toBe(4);
});

it("ボタンで拡大・縮小・出発地へ戻せる", () => {
  render(<WealthMap data={data} baseLat={35.0116} baseLon={135.7681} />);
  fireEvent.click(screen.getByRole("button", { name: "拡大" }));
  expect(zoomProps.last?.zoom).toBe(2);
  fireEvent.click(screen.getByRole("button", { name: "拡大" }));
  expect(zoomProps.last?.zoom).toBe(4);
  fireEvent.click(screen.getByRole("button", { name: "縮小" }));
  expect(zoomProps.last?.zoom).toBe(2);
  const onMoveEnd = zoomProps.last?.onMoveEnd as (p: {
    coordinates: [number, number];
    zoom: number;
  }) => void;
  act(() => onMoveEnd({ coordinates: [140, 40], zoom: 2 }));
  fireEvent.click(screen.getByRole("button", { name: "出発地へ戻す" }));
  expect(zoomProps.last?.center).toEqual([135.7681, 35.0116]);
});

it("点を押すと吹き出しが出る（指でも見られる）", () => {
  render(<WealthMap data={data} baseLat={35.0116} baseLon={135.7681} />);
  const markers = screen.getAllByTestId("marker");
  fireEvent.click(markers[markers.length - 1]);
  expect(screen.getByText(/架空市: 300万円/)).toBeTruthy();
});

it("出発地が後から届いたら、そこへ中心を移す", () => {
  const view = render(<WealthMap data={data} />);
  view.rerender(<WealthMap data={data} baseLat={35.0116} baseLon={135.7681} />);
  expect(zoomProps.last?.center).toEqual([135.7681, 35.0116]);
});
