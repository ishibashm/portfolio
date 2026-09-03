import { Shippori_Mincho } from "next/font/google";

/**
 * 見出しと本文（セリフ体テーマ）の明朝体。
 *
 * ## なぜ layout.tsx から分けたか
 *
 * next/font は呼んだモジュールの CSS 束に @font-face を出す。日本語
 * フォントは Google 側で 120 前後の部分集合に割られていて、2 ウェイト
 * ぶんの @font-face だけで **gzip 62 KB**。layout.tsx に置くと全頁の
 * `<link rel="stylesheet">` に入り、**最初の描画を止める**（遅い回線
 * 400 kbps の実測で、描画まで 5.9 秒のうち 1.3 秒ぶん）。
 *
 * ここに分けて `SerifFontLoader` から `import()` で読む。CSS は hydration
 * のあとに落ちてきて、それまでは globals.css の `--font-shippori-mincho`
 * の既定（端末の明朝体）で描く。届いたら入れ替わる（display: swap と
 * 同じ見え方。preload を切ってある分、以前も入れ替わっていた）。
 *
 * 呼び方は以前の layout.tsx のまま。**ウェイトを増やさない**こと
 * （1 ウェイトで @font-face が 120 個増える）。
 */
export const shipporiMincho = Shippori_Mincho({
  // 実際に font-serif と併用されているのは font-bold(700) だけで、
  // 本文にセリフ体を選べるテーマがあるので 400 は残す。
  weight: ["400", "700"],
  variable: "--font-shippori-mincho",
  subsets: ["latin"],
  display: "swap",
  // 既定では全部分集合に <link rel="preload"> が出る（1 頁 124 個）。
  // 切ると、頁に実際に出る文字の部分集合だけが読まれる。
  preload: false,
});
