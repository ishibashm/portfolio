import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

/**
 * 共有カード（og:image）をその頁の題で描く。
 *
 * ルートの openGraph.images は全頁 `/ogp.png` だった。頁ごとに題の入った
 * 画像が要るが、Satori（next/og）は日本語のグリフを持たない。フォントを
 * 渡さないと豆腐になる。fontconfig の代替（環境に無いと中国語の書体に
 * 落ちる）はここには効かない。Noto Sans JP の太字を同梱して渡す。
 * ライセンスは隣の OFL.txt。
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/**
 * 題が長いと 1200px に収まらない。全角をほぼ fontSize px とみて、
 * 3 行以内かつ最終行が 1 字だけにならない最大の大きさを採る。
 */
export function ogTitleFontSize(title: string): number {
  const n = Math.max(1, Array.from(title).length);
  const width = 1000;
  const sizes = [64, 56, 48, 42, 36];
  const fit = (size: number) => {
    const perLine = Math.max(1, Math.floor(width / size));
    const lines = Math.ceil(n / perLine);
    const last = n - perLine * (lines - 1);
    return { lines, last };
  };
  for (const size of sizes) {
    if (fit(size).lines === 1) return size;
  }
  for (const size of sizes) {
    const { lines, last } = fit(size);
    if (lines <= 3 && last >= 2) return size;
  }
  return 36;
}

function clipTitle(title: string): string {
  const chars = Array.from(title);
  if (chars.length <= 72) return title;
  return `${chars.slice(0, 71).join("")}…`;
}

const FONT_PATH = path.join(process.cwd(), "src/lib/og/NotoSansJP-Bold.ttf");

let fontPromise: Promise<ArrayBuffer> | undefined;

function loadFont(): Promise<ArrayBuffer> {
  /*
    fetch(new URL(..., import.meta.url)) は Vite のテストで localhost に
    化けて読めない。実行位置からのパスで読む。standalone への同梱は
    next.config の outputFileTracingIncludes（この経路は cwd を静的に
    追えないため）。
  */
  fontPromise ??= readFile(FONT_PATH).then((buf) => {
    if (buf.byteLength < 100_000) {
      throw new Error("日本語の OG フォントが小さすぎます");
    }
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  });
  return fontPromise;
}

export async function ogImage(input: {
  eyebrow: string;
  title: string;
}): Promise<ImageResponse> {
  const font = await loadFont();
  const title = clipTitle(input.title);
  const titleSize = ogTitleFontSize(title);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#faf7f5",
        color: "#1c1917",
        fontFamily: "Noto Sans JP",
      }}
    >
      <div style={{ width: 18, height: "100%", background: "#be123c" }} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 1182,
          height: "100%",
          padding: "64px 72px",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: "#9f1239" }}>
          {input.eyebrow}
        </div>
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            fontSize: titleSize,
            fontWeight: 700,
            lineHeight: 1.35,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            fontSize: 28,
            color: "#57534e",
          }}
        >
          <div style={{ display: "flex" }}>Cloud Palette</div>
          <div style={{ display: "flex", fontSize: 24 }}>
            引越しの方位とタイミング
          </div>
        </div>
      </div>
    </div>,
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      fonts: [
        { name: "Noto Sans JP", data: font, weight: 400, style: "normal" },
        { name: "Noto Sans JP", data: font, weight: 700, style: "normal" },
      ],
    },
  );
}
