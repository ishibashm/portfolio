import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * 左上のメニューは、React が繋がる前から開く。
 *
 * ## なぜ
 *
 * ボタンは HTML には最初から出ているが、React の onClick が付くのは
 * hydration のあと。実測（CPU 4 倍のモバイル）で、押しても何も起きない
 * 時間が **物件検索で 4.6 秒（良い回線）・8.7 秒（遅い回線）**あった。
 * 利用者からの「反応が悪い」はこれ。
 *
 * 開閉は `<html data-menu>` だけが持ち、layout.tsx の素のスクリプトが
 * 切り替え、globals.css がそれを見て描く。React（GlobalSidebar）は
 * 読むだけ。**どれか 1 つが欠けると、また hydration 待ちに戻る**ので
 * 3 つとも固定する。
 */
const ROOT = join(__dirname, "..");
const layout = readFileSync(join(ROOT, "src/app/layout.tsx"), "utf8");
const sidebar = readFileSync(
  join(ROOT, "src/components/GlobalSidebar.tsx"),
  "utf8",
);
const css = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");

describe("メニューは hydration を待たずに開く", () => {
  it("layout に、hydration を待たない素の切り替えがある", () => {
    expect(layout).toMatch(/\[data-menu-toggle\],\[data-menu-close\]/);
    expect(layout).toMatch(/root\.setAttribute\('data-menu', next\)/);
    /* next/script（afterInteractive）だと結局 hydration と同じころまで
       待たされる。素の <script> のまま head に置く。 */
    expect(layout).not.toMatch(/from "next\/script"/);
  });

  it("ボタンは data-menu-toggle を持ち、React では切り替えない", () => {
    expect(sidebar).toMatch(/data-menu-toggle/);
    expect(sidebar).not.toMatch(/toggleSidebar/);
    expect(sidebar).not.toMatch(/setIsOpen/);
  });

  it("開いているかは属性から読む（state に戻さない）", () => {
    expect(sidebar).toMatch(/useSyncExternalStore\(\s*subscribeMenu/);
  });

  it("覆いとアイコンを React の分岐で出し分けない", () => {
    /* {isOpen && <div …>} に戻すと、hydration 前に開いても出ない */
    expect(sidebar).not.toMatch(/\{isOpen &&/);
    expect(sidebar).toMatch(/data-menu-overlay/);
    expect(sidebar).toMatch(/data-menu-icon="open"/);
    expect(sidebar).toMatch(/data-menu-icon="close"/);
  });

  it("位置は CSS が属性から決める", () => {
    expect(css).toMatch(
      /html\[data-menu="open"\] \[data-menu-panel\] \{\s*--tw-translate-x: 0;/,
    );
    expect(css).toMatch(
      /html:not\(\[data-menu="open"\]\) \[data-menu-overlay\] \{\s*display: none;/,
    );
    expect(sidebar).toMatch(/data-menu-panel/);
  });

  it("開閉のアニメーションで backdrop-filter を動かさない", () => {
    /* transition-all + backdrop-blur だと毎フレーム背景をぼかし直す
       （実測 30fps。カク付きの実体） */
    const aside = sidebar.slice(sidebar.indexOf("<aside"));
    const cls = aside.slice(0, aside.indexOf(">"));
    expect(cls).not.toMatch(/transition-all/);
    expect(cls).not.toMatch(/backdrop-blur/);
  });
});
