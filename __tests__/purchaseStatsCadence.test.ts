import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 購入の相場（`/relocation/purchase`）が書いている**集計の頻度**が、
 * 実際のワークフローの cron と合っていること。
 *
 * ## 何が起きていたか
 *
 * 頁も道具の一覧も「毎晩の集計で更新されます」と書いていたが、
 * `build-purchase-stats.yml` の cron は `"10 20 * * 1"`（月曜 20:10 UTC
 * ＝火曜 05:10 JST）で、**毎週**だった。2026-09-20 に訂正した。
 *
 * ## なぜ字面で見張るか
 *
 * 頻度を頁に書き写している以上、cron を変えたときに片方だけ古くなる。
 * **数字を持っているのは cron のほう**なので、そちらを読んで突き合わせる。
 *
 * 掲載（賃貸の巡回）とは別の話。あちらは取り込みそのものを止めたので
 * `listingFreshness` が見ている。こちらは動いているが**頻度の記述が
 * 違っていた**だけ。
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const WORKFLOW = ".github/workflows/build-purchase-stats.yml";
const PAGE = "src/app/relocation/purchase/page.tsx";
const STRUCTURE = "src/lib/siteStructure.ts";

/** cron の曜日欄。`*` なら毎日、数字や範囲が入っていれば週に何回か。 */
function cronDayOfWeek(yml: string): string {
  const m = yml.match(/- cron:\s*"([^"]+)"/);
  expect(m, "cron が 1 つも無い").toBeTruthy();
  const fields = m![1].trim().split(/\s+/);
  expect(fields, "cron は 5 欄").toHaveLength(5);
  return fields[4];
}

describe("購入の相場が書いている集計の頻度", () => {
  const yml = read(WORKFLOW);

  it("cron は毎日ではない（曜日が指定されている）", () => {
    /* ここが `*` に戻ったら、下の「毎日ではない」という前提が崩れる。 */
    expect(cronDayOfWeek(yml)).not.toBe("*");
  });

  it("頁が「毎晩」「毎日」と書いていない", () => {
    const page = read(PAGE);
    /* 毎日でない以上、この 2 語は嘘になる。 */
    for (const word of ["毎晩の集計", "毎日の集計", "毎晩更新", "毎日更新"]) {
      expect(page, `頁に「${word}」が残っている`).not.toContain(word);
    }
    expect(page).toContain("毎週の集計で更新されます");
  });

  it("道具の一覧も同じ頻度を書いている", () => {
    /* 頁だけ直すと入口で嘘が残る（#1457 で家賃市場でも同じことがあった）。 */
    const structure = read(STRUCTURE);
    expect(structure).not.toContain("都道府県別の相場を毎晩集計する");
    expect(structure).toContain("都道府県別の相場を毎週集計する");
  });
});
