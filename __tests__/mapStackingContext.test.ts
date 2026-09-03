import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 地図とメニューの重なり順。
 *
 * Android の実機で「開いたメニューの上に地図と頁の帯が乗る」報告があった。
 * 原因は 2 つで、どちらも数字を大きくして解決すべきものではなかった。
 *
 * 1. 地図の器が入れ物になっていなかった
 *    ArbitrageMapInner の非全画面の器は `relative` だけだった。
 *    `relative` は z-index が auto なので**重ね合わせ文脈を作らない**。
 *    中の Leaflet の枠（.leaflet-pane 400・コントロール 1000）と、
 *    その上に重ねている凡例・全画面ボタン・吉凶の札（z-[1000]）が
 *    器をすり抜けて頁全体と背比べし、メニュー（z-40）より前に出ていた。
 *    `isolate`（isolation: isolate）で器の中に閉じ込める。
 *
 * 2. メニューと頁の帯が同じ z-40 だった
 *    同じ数なら後に書いたほうが前に出る。GlobalSidebar は layout.tsx の
 *    children より前に置かれているので、頁の帯（arbitrage の
 *    「地図 / 一覧・条件」など sticky top-0 z-40）が必ず勝っていた。
 *
 * 層は 40 <（覆い・パネル・開閉ボタン）< 50 に収める。
 * モーダル（z-50）より下なのは意図で、全画面の覆いが出ているあいだは
 * メニューの開閉ボタンも隠れるのが正しい。
 *
 * どちらも目で見ないと気付けない類なので、ここで固定する。
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const MAP_INNER = read("src/components/ArbitrageMapInner.tsx");
const SIDEBAR = read("src/components/GlobalSidebar.tsx");
const ARBITRAGE_PAGE = read("src/app/relocation/arbitrage/page.tsx");

/** 非全画面の器（className の三項の else 側）を取り出す。 */
const NON_FULLSCREEN_ROOT = MAP_INNER.match(
  /\? "fixed inset-0 z-\[2000\] bg-white"\s*\n\s*: "([^"]+)"/,
)?.[1];

/** GlobalSidebar の 3 つの層を数字で拾う。 */
function layer(pattern: RegExp): number {
  const m = SIDEBAR.match(pattern);
  if (!m) return NaN;
  return Number(m[1]);
}

const OVERLAY = layer(/fixed inset-0 bg-stone-900\/30 z-\[(\d+)\]/);
const PANEL = layer(/fixed top-0 left-0 h-full z-\[(\d+)\]/);
const TOGGLE = layer(/lg:hidden fixed top-4 left-4 z-\[(\d+)\]/);

/** 頁の中の帯（sticky）が使っている層。ここより上にメニューを置く。 */
const STICKY_CHROME = 40;
/** 全画面の覆い。ここより下にメニューを置く。 */
const MODAL = 50;

describe("地図の器が重ね合わせ文脈になっている", () => {
  it("非全画面の器を取り出せている（この検査自体が空回りしていない）", () => {
    expect(NON_FULLSCREEN_ROOT).toBeTruthy();
    expect(NON_FULLSCREEN_ROOT).toContain("relative");
  });

  it("非全画面の器に isolate が付いている", () => {
    // 外すと Leaflet の枠と z-[1000] の札が頁全体に出て、メニューを覆う
    expect(NON_FULLSCREEN_ROOT).toContain("isolate");
  });

  it("全画面のときは fixed + z-[2000] のまま（isolate を付けない）", () => {
    // 付けると頁の帯より後ろに落ちて、全画面が全画面でなくなる
    expect(MAP_INNER).toContain('? "fixed inset-0 z-[2000] bg-white"');
  });

  it("地図の中の札は z-[1000] のままでよい（器の中で閉じているので）", () => {
    expect(MAP_INNER).toContain("z-[1000]");
  });
});

describe("頁側の地図の覆いは頁の層に出ない", () => {
  it("arbitrage の頁に z-[1000] 級の指定が残っていない", () => {
    // 走査中の覆いは地図の器の中の兄弟。器は relative だけで入れ物に
    // ならないので、大きい数を書くとそのまま頁全体に効いてしまう
    expect(ARBITRAGE_PAGE).not.toMatch(/z-\[\d{3,}\]/);
  });
});

describe("メニューの層", () => {
  it("3 つとも数字を拾えている（この検査自体が空回りしていない）", () => {
    expect(Number.isFinite(OVERLAY)).toBe(true);
    expect(Number.isFinite(PANEL)).toBe(true);
    expect(Number.isFinite(TOGGLE)).toBe(true);
  });

  it("頁の中の帯（z-40）より上にある", () => {
    expect(OVERLAY).toBeGreaterThan(STICKY_CHROME);
    expect(PANEL).toBeGreaterThan(STICKY_CHROME);
    expect(TOGGLE).toBeGreaterThan(STICKY_CHROME);
  });

  it("全画面の覆い（z-50）より下にある", () => {
    expect(OVERLAY).toBeLessThan(MODAL);
    expect(PANEL).toBeLessThan(MODAL);
    expect(TOGGLE).toBeLessThan(MODAL);
  });

  it("覆い < パネル < 開閉ボタン の順になっている", () => {
    // パネルが覆いに沈むと灰色越しに見える。開閉ボタンが沈むと閉じられない
    expect(OVERLAY).toBeLessThan(PANEL);
    expect(PANEL).toBeLessThan(TOGGLE);
  });
});

/**
 * 地図を積む部品は全部同じ穴を持っていた。#694 では報告のあった
 * ArbitrageMapInner だけを塞いだので、残り 4 つをここで総当たりにする。
 *
 * TacticalMagneticMap は `relative z-0` で先に塞がっていた（z-0 は
 * auto と違って重ね合わせ文脈を作る）。数え方を変えると取りこぼすので、
 * 「MapContainer を描いているファイル」を実際に歩いて集める。
 * 字面で探して取りこぼした事故が過去に 2 回ある（CLAUDE.md 3 節・4 節）。
 */
function leafletComponents(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.endsWith(".tsx")) continue;
      if (readFileSync(path, "utf8").includes("<MapContainer")) {
        found.push(path.replace(`${process.cwd()}/`, ""));
      }
    }
  };
  walk(join(process.cwd(), "src"));
  return found.sort();
}

const LEAFLET_COMPONENTS = leafletComponents();

describe("Leaflet を積む部品はすべて器を入れ物にしている", () => {
  it("部品を集められている（この検査自体が空回りしていない）", () => {
    expect(LEAFLET_COMPONENTS.length).toBeGreaterThanOrEqual(5);
  });

  it.each(LEAFLET_COMPONENTS)("%s の器が入れ物になっている", (file) => {
    // `isolate` と `relative` が同じ className に並んでいること。
    // relative だけだと z-index が auto で入れ物にならず、中の
    // z-[1000] の札と Leaflet の枠が頁全体まですり抜ける
    expect(readFileSync(join(process.cwd(), file), "utf8")).toMatch(
      /"isolate\b[^"]*\brelative\b/,
    );
  });
});
