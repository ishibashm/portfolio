import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/*
  設定の座標を **`.toString()` で素のまま読まない**。

  #1423 が「クラウドで消した跡」を欄の値に null で置いたとき、

      if (config.birth_lat !== undefined) bLat = config.birth_lat.toString();

  と書いてある所が TypeError で落ちた。`catch {}` が飲み込むので画面は
  出来上がり、**その後ろに並ぶ欄（出発地・盤の種類・真北・月相）が丸ごと
  読まれないまま既定値に落ちる。**#1426 で跡の持ち方は直したが、この
  書き方自体が「値があるか」を取り違えている（null・文字列・NaN を
  素通しする）ので、`settingNumber` に寄せていく。

  **残りは減らす一方**にする。ここに足すのではなく、ここから消すこと。
*/

/** まだ直していないファイル。**空のまま保つ。** */
const REMAINING: ReadonlySet<string> = new Set<string>();

const COORD_TO_STRING = /\.(birth_lat|birth_lon|base_lat|base_lon)\.toString\(/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

describe("設定の座標の読み方", () => {
  const offenders = walk("src")
    .filter((path) => COORD_TO_STRING.test(readFileSync(path, "utf-8")))
    .sort();

  it("素の .toString() で読んでいる所はもう無い", () => {
    expect(offenders).toEqual([...REMAINING].sort());
  });

  it("残りの一覧に、もう直したファイルが混ざっていない", () => {
    for (const path of REMAINING) expect(offenders).toContain(path);
  });
});
