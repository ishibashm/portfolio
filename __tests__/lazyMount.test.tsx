import { render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LazyMount } from "@/components/LazyMount";

/**
 * `LazyMount` は**画面に近づくまで中身を作らない**。ホームの時計を初回表示の
 * 待ち時間から外すために入れた（時計は 360x640 の画面で 2856px の位置。
 * 4.5 画面ぶん下にある）。
 *
 * 見張るのは 2 つ。
 *
 *   1. 近づく前は作らない（作ってしまったら意味が無い）
 *   2. **中身を隠さない。**IntersectionObserver が無ければ待たずに出す
 *
 * 2 が抜けると、監視の仕組みを持たない環境で中身が永久に出ない。
 */

type Cb = (entries: { isIntersecting: boolean }[]) => void;

let callbacks: Cb[] = [];
let disconnected = 0;
const original = globalThis.IntersectionObserver;

class FakeObserver {
  constructor(cb: Cb) {
    callbacks.push(cb);
  }
  observe() {}
  disconnect() {
    disconnected += 1;
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  callbacks = [];
  disconnected = 0;
  globalThis.IntersectionObserver =
    FakeObserver as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  globalThis.IntersectionObserver = original;
});

function Marker() {
  return <span>中身</span>;
}

describe("LazyMount", () => {
  it("近づくまでは中身を作らない", () => {
    render(
      <LazyMount fallback={<span>待ち</span>}>
        <Marker />
      </LazyMount>,
    );
    expect(screen.queryByText("中身")).toBeNull();
    expect(screen.getByText("待ち")).toBeTruthy();
  });

  it("画面に入ったら作る", () => {
    render(
      <LazyMount fallback={<span>待ち</span>}>
        <Marker />
      </LazyMount>,
    );
    act(() => callbacks.forEach((cb) => cb([{ isIntersecting: true }])));

    expect(screen.getByText("中身")).toBeTruthy();
    expect(screen.queryByText("待ち")).toBeNull();
  });

  it("一度出したら監視をやめる", () => {
    render(
      <LazyMount>
        <Marker />
      </LazyMount>,
    );
    act(() => callbacks.forEach((cb) => cb([{ isIntersecting: true }])));
    expect(disconnected).toBeGreaterThanOrEqual(1);
  });

  it("交差していない通知では作らない", () => {
    render(
      <LazyMount fallback={<span>待ち</span>}>
        <Marker />
      </LazyMount>,
    );
    act(() => callbacks.forEach((cb) => cb([{ isIntersecting: false }])));
    expect(screen.queryByText("中身")).toBeNull();
  });

  it("IntersectionObserver が無い環境では待たずに出す", async () => {
    // ここが抜けると、中身が永久に出ない環境ができる。
    // @ts-expect-error 監視の仕組みが無い環境を作る
    delete globalThis.IntersectionObserver;

    render(
      <LazyMount fallback={<span>待ち</span>}>
        <Marker />
      </LazyMount>,
    );
    // 効果の中で同期に出すと連鎖描画になるので、次の順番に回している。
    expect(await screen.findByText("中身")).toBeTruthy();
  });
});
