"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import { hasRenderedBox } from "@/utils/mapViewport";

/**
 * 地図の描画サイズをコンテナに追従させる。
 *
 * Leaflet は自分のコンテナのサイズをマウント時に一度測り、そのサイズで
 * タイルを敷く。あとからコンテナが大きくなっても気付かないため、
 * 広がった部分がタイルの無い黒地のまま残る。
 *
 * 実際に「小さいディスプレイから大きいディスプレイへブラウザを移すと
 * 地図の下半分が黒くなる」という形で出た。以前の実装はマウント時に
 * 2 回呼ぶだけ（arbitrage）か、window の resize だけ見る（magnetic）で、
 * どちらもこの状況を拾えない。
 *
 * 拾うべき変化は 4 通りある。
 *
 *   1. コンテナ自体の寸法変化 … サイドバーの開閉、表モードでの
 *      幅の変化。window の resize は発火しない → ResizeObserver
 *   2. ウィンドウの寸法変化   … ディスプレイ間の移動、分割表示 →
 *      resize / orientationchange
 *   3. 画素密度の変化         … 同じ CSS サイズでも別 DPI の
 *      ディスプレイへ移るとタイルを描き直す必要がある →
 *      matchMedia(resolution)
 *   4. 復帰時                 … bfcache から戻ったとき → pageshow
 *
 * 呼び出しは requestAnimationFrame でまとめる。ResizeObserver は
 * ドラッグ中に毎フレーム飛んでくるので、そのたびに invalidateSize を
 * 呼ぶとタイル要求が跳ねる。
 */
export function InvalidateMapSize() {
  const map = useMap();

  useEffect(() => {
    let frame = 0;
    const invalidate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // アンマウント直後に呼ぶと内部の _panes が無く例外になる
        try {
          /*
            隠れているあいだは測り直さない。スマホで一覧へ切り替えると
            器が display:none になり、下の ResizeObserver がそれを
            0×0 の寸法変化として拾う。そこで invalidateSize を呼ぶと
            Leaflet は寸法が変わったとみなして moveend を発火し、
            0×0 の地図の**一点に潰れた**表示範囲が絞り込みに流れて
            「範囲内 0 件」になっていた（利用者報告。utils/mapViewport）。
            見えたときに ResizeObserver がもう一度飛んでくるので、
            ここで飛ばしても測り直しは取りこぼさない。
          */
          if (!hasRenderedBox(map.getSize())) return;
          map.invalidateSize({ animate: false });
        } catch {
          /* noop */
        }
      });
    };

    // マウント直後。レイアウトが落ち着くまで数回試す。1 回だけだと
    // 親が flex/grid で後から寸法を決める場合に取りこぼす。
    invalidate();
    const timers = [80, 300, 800].map((ms) => setTimeout(invalidate, ms));

    const container = map.getContainer();
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(invalidate);
      ro.observe(container);
    }

    window.addEventListener("resize", invalidate);
    window.addEventListener("orientationchange", invalidate);
    window.addEventListener("pageshow", invalidate);

    // 画素密度の変化。ディスプレイをまたぐと dppx が変わることがある。
    let dpiQuery: MediaQueryList | undefined;
    if (typeof window.matchMedia === "function") {
      dpiQuery = window.matchMedia(
        `(resolution: ${window.devicePixelRatio}dppx)`,
      );
      dpiQuery.addEventListener?.("change", invalidate);
    }

    return () => {
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      ro?.disconnect();
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("orientationchange", invalidate);
      window.removeEventListener("pageshow", invalidate);
      dpiQuery?.removeEventListener?.("change", invalidate);
    };
  }, [map]);

  return null;
}

export default InvalidateMapSize;
