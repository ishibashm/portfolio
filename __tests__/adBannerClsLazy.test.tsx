import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdBanner, AD_MIN_HEIGHT } from "@/components/ads/AdBanner";

const ID = "pub-1234567890123456";

type Win = Window & { adsbygoogle?: unknown[] };

describe("AdBanner: 高さの確保と遅延読み込み", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_ADSENSE_ID", ID);
    vi.stubEnv("NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE", "1234567890");
    delete (window as Win).adsbygoogle;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("ID が無ければ何も描かない（審査前に空の枠を見せない）", () => {
    vi.stubEnv("NEXT_PUBLIC_ADSENSE_ID", "");
    expect(renderToStaticMarkup(createElement(AdBanner))).toBe("");
  });

  it("届く前から高さを確保し、「広告」と表記する", () => {
    const html = renderToStaticMarkup(createElement(AdBanner));
    expect(html).toContain(`min-height:${AD_MIN_HEIGHT.auto}px`);
    expect(html).toContain(">広告<");
    expect(html).toContain('data-ad-client="ca-pub-1234567890123456"');
  });

  it("画面に近づくまで push しない", async () => {
    let fire: ((e: { isIntersecting: boolean }[]) => void) | null = null;
    class IO {
      constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
        fire = cb;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", IO);
    const el = document.createElement("div");
    const root = createRoot(el);
    await act(async () => root.render(createElement(AdBanner)));
    expect((window as Win).adsbygoogle).toBeUndefined();
    await act(async () => fire!([{ isIntersecting: true }]));
    expect((window as Win).adsbygoogle).toHaveLength(1);
    // 2 度目の交差で二重に push しない（AdSense はエラーにする）。
    await act(async () => fire!([{ isIntersecting: true }]));
    expect((window as Win).adsbygoogle).toHaveLength(1);
    root.unmount();
  });
});
