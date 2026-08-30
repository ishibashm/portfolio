import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MAP_THEME_EVENT,
  MAP_THEME_STORAGE_KEY,
  useMapTheme,
} from "@/lib/useMapTheme";

/**
 * 地図の明暗。5 か所の写しを 1 か所に寄せたもの。
 *
 * 固定したいのは 3 つ。
 *
 * 1. 保存されている値を読む（既定は light）
 * 2. 切り替えると localStorage に書き、**同じ画面の他の地図にも伝わる**
 *    （1 つの画面に地図が 2 つ出ることがある。ホームの目的地タブと
 *    出発地ピッカーなど）
 * 3. 鍵とイベント名を変えない。変えると利用者の設定が失われる
 */

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("useMapTheme", () => {
  it("鍵とイベント名は変えない（変えると設定が失われる）", () => {
    expect(MAP_THEME_STORAGE_KEY).toBe("map_theme");
    expect(MAP_THEME_EVENT).toBe("mapThemeChanged");
  });

  it("保存が無ければ light", () => {
    const { result } = renderHook(() => useMapTheme());
    expect(result.current.mapTheme).toBe("light");
  });

  it("保存されている dark を読む", () => {
    localStorage.setItem(MAP_THEME_STORAGE_KEY, "dark");
    const { result } = renderHook(() => useMapTheme());
    expect(result.current.mapTheme).toBe("dark");
  });

  it("壊れた値は light に倒す", () => {
    localStorage.setItem(MAP_THEME_STORAGE_KEY, "ダーク");
    const { result } = renderHook(() => useMapTheme());
    expect(result.current.mapTheme).toBe("light");
  });

  it("切り替えると保存され、状態も入れ替わる", () => {
    const { result } = renderHook(() => useMapTheme());

    act(() => result.current.toggleMapTheme());
    expect(localStorage.getItem(MAP_THEME_STORAGE_KEY)).toBe("dark");
    expect(result.current.mapTheme).toBe("dark");

    act(() => result.current.toggleMapTheme());
    expect(localStorage.getItem(MAP_THEME_STORAGE_KEY)).toBe("light");
    expect(result.current.mapTheme).toBe("light");
  });

  it("同じ画面の別の地図にも伝わる", () => {
    const a = renderHook(() => useMapTheme());
    const b = renderHook(() => useMapTheme());

    act(() => a.result.current.toggleMapTheme());

    expect(a.result.current.mapTheme).toBe("dark");
    expect(b.result.current.mapTheme).toBe("dark");
  });

  it("片付けたあとは反応しない", () => {
    const { result, unmount } = renderHook(() => useMapTheme());
    const before = result.current.mapTheme;
    unmount();
    act(() => {
      localStorage.setItem(MAP_THEME_STORAGE_KEY, "dark");
      window.dispatchEvent(new Event(MAP_THEME_EVENT));
    });
    expect(result.current.mapTheme).toBe(before);
  });
});
