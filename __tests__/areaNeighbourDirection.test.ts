import { describe, it, expect } from "vitest";
import { AREAS, neighboursByDirection } from "@/lib/areaContent";
import {
  COMPASS_DIRECTIONS,
  type CompassDirection,
} from "@/utils/directionGeo";

/**
 * エリアページの近隣一覧を、寄せる前と同じ結果に保つ。
 *
 * areaContent は lib/geoDirection の getBearing / getDistance /
 * getDirectionFromBearing を使っていた。geoDirection は utils/directionGeo と
 * 同じことをする 2 つ目の集約モジュールで、消費者はここだけだったので退役
 * させ、directionGeo に寄せた。
 *
 * この関数は /houi/area/{コード} を 400 枚以上生成する元なので、丸め方が
 * 1 か所ずれるだけで公開ページの内容が静かに変わる。寄せる前の式をこの
 * ファイルに写して、同じ答えになることを固定する。
 */

/** 退役した lib/geoDirection の実装。比較対象としてだけ残す。 */
function legacyGetBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const l1 = lat1 * (Math.PI / 180);
  const l2 = lat2 * (Math.PI / 180);
  const y = Math.sin(dLon) * Math.cos(l2);
  const x =
    Math.cos(l1) * Math.sin(l2) - Math.sin(l1) * Math.cos(l2) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

function legacyGetDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function legacyGetDirectionFromBearing(bearing: number): CompassDirection {
  const b = ((bearing % 360) + 360) % 360;
  if (b >= 345 || b < 15) return "N";
  if (b < 75) return "NE";
  if (b < 105) return "E";
  if (b < 165) return "SE";
  if (b < 195) return "S";
  if (b < 255) return "SW";
  if (b < 285) return "W";
  return "NW";
}

/** 寄せる前の neighboursByDirection を、公開されている定数から組み直す。 */
function legacyNeighbours(origin: (typeof AREAS)[number]) {
  const MIN_KM = 5;
  const MAX_KM = 150;
  const out: Record<string, { code: string; direction: string }[]> = {};
  for (const d of COMPASS_DIRECTIONS) out[d] = [];

  const rows: { code: string; direction: CompassDirection; km: number }[] = [];
  for (const a of AREAS) {
    if (a.code === origin.code) continue;
    const km = legacyGetDistance(origin.lat, origin.lon, a.lat, a.lon);
    if (km < MIN_KM || km > MAX_KM) continue;
    const direction = legacyGetDirectionFromBearing(
      legacyGetBearing(origin.lat, origin.lon, a.lat, a.lon),
    );
    rows.push({ code: a.code, direction, km: Math.round(km) });
  }
  rows.sort((x, y) => x.km - y.km);
  for (const r of rows)
    out[r.direction].push({ code: r.code, direction: r.direction });
  return out;
}

describe("エリアページの近隣一覧（directionGeo への集約）", () => {
  // 全 400 枚超を回すと重いので、南北に散らした代表を取る。
  const sample = [...AREAS]
    .sort((a, b) => a.code.localeCompare(b.code))
    .filter((_, i) => i % 37 === 0);

  it("代表エリアを走査できている（テストが空回りしない）", () => {
    expect(sample.length).toBeGreaterThan(5);
    const anyNeighbour = sample.some((a) =>
      COMPASS_DIRECTIONS.some((d) => neighboursByDirection(a)[d].length > 0),
    );
    expect(anyNeighbour).toBe(true);
  });

  it("方位ごとの顔ぶれと並び順が寄せる前と同じ", () => {
    for (const origin of sample) {
      const now = neighboursByDirection(origin);
      const before = legacyNeighbours(origin);

      for (const d of COMPASS_DIRECTIONS) {
        expect(
          now[d].map((n) => n.code),
          `${origin.code} の ${d}`,
        ).toEqual(before[d].map((n) => n.code));
      }
    }
  });

  it("距離と方位角の丸めも寄せる前と同じ", () => {
    for (const origin of sample) {
      for (const [, list] of Object.entries(neighboursByDirection(origin))) {
        for (const n of list) {
          expect(n.distanceKm).toBe(
            Math.round(legacyGetDistance(origin.lat, origin.lon, n.lat, n.lon)),
          );
          expect(n.bearing).toBe(
            Math.round(legacyGetBearing(origin.lat, origin.lon, n.lat, n.lon)),
          );
        }
      }
    }
  });
});
