"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * 地図の明暗。**5 か所に写されていたものを 1 か所に寄せる。**
 *
 * 地図部品はどれも同じ 15 行ほどを持っていた（state ＋ localStorage の
 * 読み出し ＋ mapThemeChanged の購読 ＋ 解除 ＋ 切り替えボタンの本体）。
 * ArbitrageMapInner・MagneticMapInner・LocationPickerInner・
 * SimulatorMap・PastMoveMap の 5 つ。**同じことを 2 か所に書かない**
 * （docs/site-spec.md の方針）に反しているうえ、直すときに取りこぼす。
 *
 * ## なぜ useSyncExternalStore なのか
 *
 * 元の実装は「マウント後の効果で localStorage を読んで setState」
 * だった。これは lint（react-hooks/set-state-in-effect）に出るうえ、
 * 1 回よけいに描き直す。localStorage ＋ カスタムイベントは
 * **React の外にある値**なので、そのための API を使う。
 *
 * サーバ側は常に light を返す。地図は dynamic(ssr:false) で読み込む
 * ので実際には描かれないが、返り値の型を揃えておく。
 */

export type MapTheme = "dark" | "light";

/** 保存先の鍵。**変えると利用者の設定が失われる。** */
export const MAP_THEME_STORAGE_KEY = "map_theme";
/** 同じ画面の別の地図へ変更を伝えるイベント名。 */
export const MAP_THEME_EVENT = "mapThemeChanged";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(MAP_THEME_EVENT, onChange);
  /* 別タブでの変更も拾う。localStorage は共有なので、拾わないと
     タブごとに違う明暗になる。 */
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(MAP_THEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readTheme(): MapTheme {
  try {
    return localStorage.getItem(MAP_THEME_STORAGE_KEY) === "dark"
      ? "dark"
      : "light";
  } catch {
    /* プライベートモードなどで読めないことがある。既定に倒す。 */
    return "light";
  }
}

function readServerTheme(): MapTheme {
  return "light";
}

export interface MapThemeState {
  mapTheme: MapTheme;
  /** 明暗を入れ替える。同じ画面の他の地図にも伝わる。 */
  toggleMapTheme: () => void;
}

export function useMapTheme(): MapThemeState {
  const mapTheme = useSyncExternalStore(subscribe, readTheme, readServerTheme);

  const toggleMapTheme = useCallback(() => {
    const next: MapTheme = readTheme() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(MAP_THEME_STORAGE_KEY, next);
    } catch {
      /* 保存できなくても、この画面のあいだは切り替わってほしい */
    }
    window.dispatchEvent(new Event(MAP_THEME_EVENT));
  }, []);

  return { mapTheme, toggleMapTheme };
}
