import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/*
  小さすぎる字を**増やさない**ための歯止め。

  ## なぜ数える形にしたか

  #1279・#1282・#1283・#1316 で 1 画面ずつ上げているが、**残りが多い**
  （9px だけで 274 か所・37 ファイル）。全部直るまで待つと、その間に
  新しく書いたコードが同じ大きさを増やしても誰も気付かない。

  そこで**総数を下限として固定する。**減らすぶんには何も起きず、
  増やすと落ちる。直したら BASELINE を下げる（下げ忘れると
  「BASELINE のほうが大きい」で落ちるので、そこも見張る）。

  ## 決め

  - **説明の段落・出典・注記は 12px 以上**（`text-xs`）。読めない出典は
    出典を示したことにならない
  - **札の中の数値の添え字は 10px 以上。**12px にすると添え字のほうが
    値より大きくなることがあるので、段落と同じ扱いにはしない
  - **10px 未満を新しく書かない。**いま 8px と 9px だけが対象

  数えるのは `text-[Npx]` の明示指定だけ。Tailwind の `text-xs` などは
  12px 以上なので対象外。
*/

/** 実測（2026-09-17。シミュレータの地図（SimulatorMap・PastMoveMap） が片付いた時点。8px は 0）。**直したら下げること。** */
const BASELINE = { 8: 0, 9: 24 };

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (name.endsWith(".tsx")) out.push(full);
    }
  };
  walk(join(process.cwd(), dir));
  return out;
}

function countTiny(): {
  total: Record<number, number>;
  byFile: Map<string, number>;
} {
  const total: Record<number, number> = {};
  const byFile = new Map<string, number>();
  for (const f of tsxFiles("src")) {
    const src = readFileSync(f, "utf8");
    let tiny = 0;
    for (const m of src.matchAll(/text-\[(\d+)px\]/g)) {
      const px = Number(m[1]);
      if (px >= 10) continue;
      total[px] = (total[px] ?? 0) + 1;
      tiny += 1;
    }
    if (tiny > 0) byFile.set(relative(process.cwd(), f), tiny);
  }
  return { total, byFile };
}

describe("小さすぎる字を増やさない", () => {
  const { total, byFile } = countTiny();

  it("見張りが空回りしていない（走査できている）", () => {
    /* 母集団ごと取れているか。0 件だと「全部直った」と区別が付かない */
    expect(tsxFiles("src").length).toBeGreaterThan(100);
  });

  for (const px of [8, 9] as const) {
    it(`${px}px が ${BASELINE[px]} 件を超えていない`, () => {
      const now = total[px] ?? 0;
      expect(
        now,
        now > BASELINE[px]
          ? `${px}px を増やしている。説明の段落と出典は text-xs（12px）、札の添え字は 10px 以上。\n多い順:\n${[
              ...byFile.entries(),
            ]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
              .map(([f, n]) => `  ${n}  ${f}`)
              .join("\n")}`
          : "",
      ).toBeLessThanOrEqual(BASELINE[px]);
    });
  }

  it("直したら BASELINE を下げている（緩いまま放置しない）", () => {
    /*
      減らしたのに BASELINE を下げないと、そのぶん静かに増やせる幅が
      できる。**歯止めは締め直して初めて歯止め。**
    */
    for (const px of [8, 9] as const) {
      const now = total[px] ?? 0;
      expect(
        BASELINE[px],
        `${px}px は実測 ${now} 件。BASELINE を ${now} に下げること`,
      ).toBe(now);
    }
  });

  it("片付いたファイルが戻っていない", () => {
    /*
      **「その N で触ったファイル」ではなく「10px 未満が 0 になった
      ファイル」だけを並べる。**#1282 は ConsultPanel の一部の行を
      上げただけで、同じファイルに 37 件残っていた（この検査を書いた
      ときに実測して分かった）。触ったことと片付いたことは違う。

      片付いたファイルが出たら、ここに足す。
    */
    for (const done of [
      "src/components/relocation/AerialThumb.tsx",
      "src/components/relocation/SpotVerdict.tsx",
      "src/components/relocation/LandPriceByDirection.tsx",
      "src/components/relocation/HousingStatsByDirection.tsx",
      "src/components/relocation/TransactionsPanel.tsx",
      "src/components/relocation/PlaceInput.tsx",
      "src/components/home/ScorecardPanel.tsx",
      "src/components/TacticalMagneticMap.tsx",
      "src/components/MagneticMapInner.tsx",
      "src/components/home/DestinationMapPanel.tsx",
      "src/components/BioMagneticDashboard.tsx",
      "src/components/ArbitrageMapInner.tsx",
      "src/components/home/ConsultPanel.tsx",
      "src/components/widgets/CosmicCalendar.tsx",
      "src/components/PersonalProfileConfig.tsx",
      "src/app/relocation/simulator/page.tsx",
      "src/app/relocation/arbitrage/page.tsx",
      "src/components/realestate/AstroGridCalendar.tsx",
      "src/components/layout/MetaphysicalConfigBar.tsx",
      "src/components/SolarTimeTable.tsx",
      "src/app/relocation/wealth/page.tsx",
      "src/components/map/PowerSpotLayer.tsx",
      "src/components/map/UserSpotLayer.tsx",
      "src/components/map/StationLayer.tsx",
      "src/components/map/CurrentLocationControl.tsx",
      "src/components/nba/SimulatorMap.tsx",
      "src/components/nba/PastMoveMap.tsx",
    ]) {
      expect(byFile.get(done) ?? 0, done).toBe(0);
    }
  });
});
