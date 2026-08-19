import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearChunkReloadFlag,
  isChunkLoadError,
  reloadOnceForChunkError,
} from "@/lib/chunkLoadError";

/**
 * デプロイ直後に出ていた「Application error」への対処。
 *
 * master へマージするたびにサイトが出て、JavaScript の塊のファイル名が
 * 変わり、前の版のファイルは消える。すでに開いている人がそのまま別の
 * 頁へ進むと、消えたファイルを取りに行って 404 になる。
 *
 * **error.tsx も global-error.tsx も 1 つも無かった**ので、Next.js の
 * 既定の英語 1 行だけが出ていた（利用者から報告あり。2026-08-20 07:48
 * JST、直前 07:33 に #440 のデプロイが完了している）。
 *
 * ここで固定するのは 2 つ。
 *   - 塊の読み込み失敗を、他の例外と取り違えないこと
 *   - 自動の読み込み直しが**1 回で止まる**こと（往復し続けない）
 */

describe("塊の読み込み失敗の見分け", () => {
  it("名前が ChunkLoadError なら該当", () => {
    const e = new Error("なんでもよい");
    e.name = "ChunkLoadError";
    expect(isChunkLoadError(e)).toBe(true);
  });

  it("ブラウザごとに違う文言をどれも拾う", () => {
    const messages = [
      "Loading chunk 4711 failed.",
      "Loading CSS chunk app/layout failed.",
      "Failed to fetch dynamically imported module: https://cloud-palette.com/_next/static/chunks/x.js",
      "error loading dynamically imported module",
      "Importing a module script failed.",
    ];
    for (const m of messages) {
      expect(isChunkLoadError(new Error(m)), m).toBe(true);
    }
  });

  it("関係のない例外は該当しない（誤って読み込み直さない）", () => {
    const others = [
      new Error("Cannot read properties of undefined (reading 'map')"),
      new TypeError("x is not a function"),
      new Error("Failed to fetch"),
      new Error("NetworkError when attempting to fetch resource."),
    ];
    for (const e of others) {
      expect(isChunkLoadError(e), e.message).toBe(false);
    }
  });

  it("Error でないものを渡しても落ちない", () => {
    for (const v of [null, undefined, "文字列", 42, {}, []]) {
      expect(isChunkLoadError(v), JSON.stringify(v)).toBe(false);
    }
  });
});

describe("自動の読み込み直し", () => {
  let reloadCount = 0;

  beforeEach(() => {
    reloadCount = 0;
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      location: {
        reload: () => {
          reloadCount += 1;
        },
      },
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function chunkError() {
    const e = new Error("Loading chunk 4711 failed.");
    e.name = "ChunkLoadError";
    return e;
  }

  it("塊の失敗なら読み込み直す", () => {
    expect(reloadOnceForChunkError(chunkError())).toBe(true);
    expect(reloadCount).toBe(1);
  });

  it("**2 回目はしない。**往復し続けない", () => {
    reloadOnceForChunkError(chunkError());
    expect(reloadOnceForChunkError(chunkError())).toBe(false);
    expect(reloadOnceForChunkError(chunkError())).toBe(false);
    expect(reloadCount).toBe(1);
  });

  it("印を消せば、次のデプロイでまた効く", () => {
    reloadOnceForChunkError(chunkError());
    clearChunkReloadFlag();
    expect(reloadOnceForChunkError(chunkError())).toBe(true);
    expect(reloadCount).toBe(2);
  });

  it("関係のない例外では読み込み直さない", () => {
    expect(reloadOnceForChunkError(new Error("普通の不具合"))).toBe(false);
    expect(reloadCount).toBe(0);
  });

  it("sessionStorage が使えないときは読み込み直さない", () => {
    // 印を残せない＝繰り返しを止められない。無限に往復させない。
    vi.stubGlobal("window", {
      location: {
        reload: () => {
          reloadCount += 1;
        },
      },
      sessionStorage: {
        getItem: () => {
          throw new Error("使えない");
        },
        setItem: () => {
          throw new Error("使えない");
        },
        removeItem: () => {},
      },
    });
    expect(reloadOnceForChunkError(chunkError())).toBe(false);
    expect(reloadCount).toBe(0);
  });
});
