import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { directionWedgeHalfWidth } from "@/utils/directionGeo";

/**
 * 公開記事 direction-seen-from-the-original-home の角度と比率を照合する。
 *
 * この記事は「2 回目の移動が 1 回目に対してどれくらいなら、元の家から
 * 見た方角が隣の扇形へ出るか」を表にしている。**扇形の幅が前提**なので、
 * 区分の切り方を変えると記事だけが古くなる。
 *
 * **実際に古くなっていた。**「八方位は1つが45度幅」「隣の扇形へ出るには
 * 22.5度」「2回目が1回目の約38%以上」と書かれていたが、判定の既定は
 * 伝統区分（四正 30 度・四隅 60 度）。四正なら半幅 15 度で約 26%、
 * 四隅なら半幅 30 度で 50% で、**同じ移動でも倍ちがう**。記事は片方に
 * 丸めた数字を出していた（#1496 の how-much-does-distance-matter と
 * 同じ形）。2026-09-22 に直し、ここで固定する。
 *
 * 角度の表そのもの（5% → 約2.9度 …）は asin(r/d) で正しいので、
 * **式のほうも一緒に見る**。前提だけ直して表が置き去りになるのを防ぐ。
 */

const SLUG = "direction-seen-from-the-original-home";
const md = readFileSync(join(__dirname, `../content/blog/${SLUG}.md`), "utf-8");

/** 2 回目が 1 回目の r 倍のとき、元の家から見た方角のずれの最大値（度）。 */
function maxShiftDeg(ratio: number): number {
  return (Math.asin(ratio) * 180) / Math.PI;
}

describe("記事: 元の家から見た方角が変わらない", () => {
  it("比率と角度の表が asin(r/d) と一致する", () => {
    const rows = md
      .split("\n")
      .map((l) =>
        l
          .split("|")
          .slice(1, -1)
          .map((c) => c.replace(/\*/g, "").trim()),
      )
      .filter((r) => r.length === 2 && /^\d+%$/.test(r[0]));
    expect(
      rows.map((r) => r[0]),
      "表の行",
    ).toEqual(["5%", "10%", "20%", "26%", "30%", "50%"]);

    for (const [pct, written] of rows) {
      const ratio = Number(pct.replace("%", "")) / 100;
      const deg = maxShiftDeg(ratio);
      const m = written.match(/^約?([\d.]+)度/);
      expect(m, `「${written}」を角度として読めない`).not.toBeNull();
      /* 小数 1 桁で書いてある行は 0.05 度まで、丸めた行は 0.5 度まで。 */
      const tolerance = written.includes(".") ? 0.05 : 0.5;
      expect(
        Math.abs(Number(m![1]) - deg),
        `${pct}: 記事 ${written} / 計算 ${deg.toFixed(2)}度`,
      ).toBeLessThanOrEqual(tolerance);
    }
  });

  it("四正・四隅の半幅が実装と同じで、表にも出ている", () => {
    const seisei = directionWedgeHalfWidth("N");
    const sigu = directionWedgeHalfWidth("NE");
    expect([seisei, sigu]).toEqual([15, 30]);

    expect(md).toContain(`四正）が${seisei * 2}度`);
    expect(md).toContain(`四隅）が${sigu * 2}度`);
    expect(md).toContain(`四正で${seisei}度、四隅で${sigu}度`);
    expect(md).toContain(`（四正の半幅）`);
    expect(md).toContain(`（四隅の半幅）`);
  });

  it("隣へ出るのに要る比率が、半幅の sin と一致する", () => {
    const need = (halfWidthDeg: number) =>
      Math.sin((halfWidthDeg * Math.PI) / 180);

    /* 記事は「四正で1回目の約26%、四隅で50%」と書いている。 */
    const m = md.match(/四正で1回目の約(\d+)%、四隅で(\d+)%/);
    expect(m, "比率を書いた文が見つからない").not.toBeNull();
    const seiseiPct = Number(m![1]);
    const siguPct = Number(m![2]);

    /* 書いてある比率で実際に半幅ぶん動けること（足りない数字にしない）。 */
    expect(seiseiPct / 100).toBeGreaterThanOrEqual(need(15));
    expect(siguPct / 100).toBeGreaterThanOrEqual(need(30));
    /* かつ、切り上げが 1% の範囲であること（甘すぎる数字にしない）。 */
    expect(seiseiPct / 100 - need(15)).toBeLessThan(0.01);
    expect(siguPct / 100 - need(30)).toBeLessThan(0.01);
  });

  it("40km の例が同じ計算から出ている", () => {
    const m = md.match(/四正で([\d.]+)km、四隅で([\d.]+)km/);
    expect(m, "40km の例が見つからない").not.toBeNull();
    const base = 40;
    const sin = (deg: number) => Math.sin((deg * Math.PI) / 180);

    expect(Number(m![1]), "四正").toBeCloseTo(base * sin(15), 1);
    expect(Number(m![2]), "四隅").toBeCloseTo(base * sin(30), 1);
  });

  it("45 度等分の前提が残っていない", () => {
    for (const stale of [
      "八方位は1つが45度幅",
      "隣の扇形へ出るには22.5度",
      "約38%以上必要",
      "2回目に15km以上",
      "約22.5度",
    ]) {
      expect(md, `「${stale}」が残っている`).not.toContain(stale);
    }
  });
});
