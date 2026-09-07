import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * サーバで描く頁は、日付を**日本時間で**文字にする。
 *
 * `toLocaleDateString("ja-JP")` は timeZone を省くと実行環境の時刻で
 * 日付を切る。本番（Cloud Run）と CI のビルドは UTC なので、日本時間の
 * 0〜9 時にあたる時刻は前日になる。/relocation/purchase の「最終更新」は
 * 集計が 23:49 UTC（翌 08:49 JST）に走るため**常に 1 日前**を出していた
 * （2026-09-07 に発見）。/relocation/yield は先に timeZone を付けて
 * いたので、同じ書き方に揃えた。
 *
 * ブラウザで描く部品（"use client"）は端末の時刻でよいので対象にしない。
 * 日付の文字列を作る所は utils/japanDate に寄せるのが本筋だが、
 * Intl の書式（2026/9/7）を使う所はここで見張る。
 */

const ROOT = join(process.cwd(), "src", "app");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

const isClient = (src: string) => /^\s*["']use client["']/m.test(src);

/** timeZone を伴わない toLocale{Date,}String("ja-JP" … の呼び出し。 */
const NAIVE =
  /toLocale(?:Date|Time)?String\(\s*"ja-JP"\s*(?:\)|,\s*\{(?![^}]*timeZone)[^}]*\})/g;

describe("サーバで描く頁の日付は日本時間", () => {
  const files = walk(ROOT).filter((p) => !isClient(readFileSync(p, "utf8")));

  it("見張りが空回りしていない（サーバの頁を読めている）", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((p) => p.endsWith("purchase/page.tsx"))).toBe(true);
  });

  it("timeZone の無い ja-JP の日付書式が残っていない", () => {
    const bad: string[] = [];
    for (const p of files) {
      const src = readFileSync(p, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const m of src.matchAll(NAIVE)) {
        const line = src.slice(0, m.index).split("\n").length;
        bad.push(`${p.replace(process.cwd() + "/", "")}:${line} ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("検出そのものが空回りしていない（わざと書いた行を拾う）", () => {
    expect('x.toLocaleDateString("ja-JP")'.match(NAIVE)?.length ?? 0).toBe(1);
    expect(
      'x.toLocaleString("ja-JP", { month: "short" })'.match(NAIVE)?.length ?? 0,
    ).toBe(1);
    expect(
      'x.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })'.match(NAIVE),
    ).toBeNull();
  });
});
