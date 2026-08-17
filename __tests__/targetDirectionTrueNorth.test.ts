import { describe, it, expect } from "vitest";
import {
  COMPASS_DIRECTIONS,
  destinationAtBearing,
  destinationForDirection,
  directionForDestination,
  bearingBetween,
  directionFromBearing,
  type CompassDirection,
} from "@/utils/directionGeo";

/**
 * 目的地の方位を**必ず真北で**出すようにした件の固定。
 *
 * 変更前は SolarTimeClock がこう書いていた。
 *
 *   const targetDirection = useMemo(() => {
 *     const info = getTargetDirectionInfo();
 *     if (!info) return null;
 *     return useTrueNorth ? info.trueDirection : info.magneticDirection;
 *   }, [getTargetDirectionInfo, useTrueNorth]);
 *
 * `useTrueNorth` の初期値は偽だったので、**既定では磁北基準の方位で吉凶を
 * 読んでいた。**この値がヒートマップのどの行を指すかと、地図のどの扇形を
 * 強調するかを決めるので、答えそのものが磁北基準だった。
 * CLAUDE.md 3 節は「判定は必ず真北。磁北は方位磁針で測るとずれる注意
 * としてのみ使う」と決めている。
 *
 * 同じ理由で、方位から地点を置く側（moveTargetToDirection →
 * destinationForDirection）も真北で固定した。**置く側と読む側が違う基準だと
 * 往復しない。**「北東へ動かす」で置いた地点を読み直すと北、が起きる。
 *
 * ここでは
 *
 *   1. 旧挙動（磁北で読む）を legacyDirection として写し、
 *   2. 新挙動が往復することを日本の偏角の幅 × 全方位 × 複数の出発地 ×
 *      3 つの距離で固定し、
 *   3. **旧挙動だと 1 割以上の目的地で方位が変わる**ことを、方位角を
 *      掃いて数えて示す
 *
 * の 3 つを置く。3 は「扇の中心に置いて読み直す」形では出ない
 * （偏角 7 度は幅 45〜60 度の扇に収まる）。実際の目的地は中心に無いので、
 * 方位角を 0.5 度刻みで掃く。
 */

/** 日本の偏角のおよその幅。西偏なので負。 */
const JAPAN_DECLINATIONS = [-9, -8, -7, -6, -5];

/** 出発地。北から南まで散らす。 */
const ORIGINS: { name: string; lat: number; lon: number }[] = [
  { name: "札幌", lat: 43.0618, lon: 141.3545 },
  { name: "東京", lat: 35.6895, lon: 139.6917 },
  { name: "京都", lat: 35.0116, lon: 135.7681 },
  { name: "福岡", lat: 33.5904, lon: 130.4017 },
  { name: "那覇", lat: 26.2124, lon: 127.6809 },
];

const DISTANCES_KM = [10, 50, 200];
const MAPPINGS: ("traditional" | "physical")[] = ["traditional", "physical"];

/** 変更前の読み方。**現行実装のどこからも呼ばれていない。** */
function legacyDirection(
  lat: number,
  lon: number,
  targetLat: number,
  targetLon: number,
  declination: number,
  mapping: "traditional" | "physical",
): CompassDirection {
  // useTrueNorth が偽のときの分岐（= 磁北基準で読む）を写したもの。
  return directionForDestination(
    lat,
    lon,
    targetLat,
    targetLon,
    declination,
    false,
    mapping,
  );
}

describe("目的地の方位は真北で出す", () => {
  it("方位から置いた地点を読み直すと、同じ方位に戻る", () => {
    const broken: string[] = [];

    for (const origin of ORIGINS) {
      for (const declination of JAPAN_DECLINATIONS) {
        for (const mapping of MAPPINGS) {
          for (const dir of COMPASS_DIRECTIONS) {
            for (const km of DISTANCES_KM) {
              // 置く側（moveTargetToDirection と同じ。真北で固定）
              const dest = destinationForDirection(
                origin.lat,
                origin.lon,
                dir,
                km,
                declination,
                true,
              );
              // 読む側（targetDirection と同じ。真北で固定）
              const readBack = directionForDestination(
                origin.lat,
                origin.lon,
                dest.lat,
                dest.lon,
                declination,
                true,
                mapping,
              );
              if (readBack !== dir) {
                broken.push(
                  `${origin.name} 偏角${declination} ${mapping} ${dir} ${km}km → ${readBack}`,
                );
              }
            }
          }
        }
      }
    }

    expect(broken).toEqual([]);
  });

  it("旧挙動（磁北で読む）だと 1 割以上の目的地で方位が変わる（この修正の対象）", () => {
    /*
      方位の中心に置いた地点で比べても、偏角 7 度は幅 45〜60 度の扇の内側に
      収まるので違いが出ない。**実際の目的地は扇の中心には無い。**
      地図で選んだ地点は方位角のどこにでも来るので、方位角を掃いて数える。

      これが「6〜9 件に 1 件は吉凶が入れ替わりうる」と報告した根拠。
    */
    const origin = ORIGINS[1]; // 東京

    for (const declination of JAPAN_DECLINATIONS) {
      for (const mapping of MAPPINGS) {
        let differ = 0;
        let total = 0;

        for (let bearing = 0; bearing < 360; bearing += 0.5) {
          const dest = destinationAtBearing(
            origin.lat,
            origin.lon,
            bearing,
            50,
          );
          const now = directionForDestination(
            origin.lat,
            origin.lon,
            dest.lat,
            dest.lon,
            declination,
            true,
            mapping,
          );
          const legacy = legacyDirection(
            origin.lat,
            origin.lon,
            dest.lat,
            dest.lon,
            declination,
            mapping,
          );
          if (now !== legacy) differ++;
          total++;
        }

        const rate = (differ / total) * 100;
        // 偏角 5 度で 11.1%、9 度で 20.0%（0.1 度刻みの実測）。
        // 刻みを粗くしても 1 割は下回らない。
        expect(
          rate,
          `偏角 ${declination} 度 / ${mapping} で差が ${rate.toFixed(1)}% しか出ていない`,
        ).toBeGreaterThan(10);
      }
    }
  });

  it("真北で読んだ方位は、素の方位角から出したものと一致する", () => {
    /*
      「真北で読む」が本当に真北なのかを、directionGeo の中だけで閉じずに
      素の方位角から確かめる。directionForDestination の第 6 引数を
      取り違えても、上の 2 つは往復するので通ってしまう。
    */
    for (const origin of ORIGINS) {
      for (const mapping of MAPPINGS) {
        for (const dir of COMPASS_DIRECTIONS) {
          const dest = destinationForDirection(
            origin.lat,
            origin.lon,
            dir,
            50,
            -7,
            true,
          );
          const trueBearing = bearingBetween(
            origin.lat,
            origin.lon,
            dest.lat,
            dest.lon,
          );
          expect(
            directionForDestination(
              origin.lat,
              origin.lon,
              dest.lat,
              dest.lon,
              -7,
              true,
              mapping,
            ),
          ).toBe(directionFromBearing(trueBearing, mapping));
        }
      }
    }
  });
});
