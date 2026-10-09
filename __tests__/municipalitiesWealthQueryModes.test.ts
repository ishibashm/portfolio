import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  destinationAtBearing,
  directionFromBearing,
  nodeMappingForBoard,
  parseNodeMapping,
  type NodeMapping,
} from "@/utils/directionGeo";
import { parsePhysicalMonthMode } from "@/utils/physicalMonthMode";
import { getPhysicalMonthStar } from "@/utils/ephemerisEngine";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: { municipalityWealth: { findMany } },
}));
vi.mock("@/utils/geomagnetism", () => ({
  getGeomagneticData: vi.fn().mockResolvedValue({ declination: 0 }),
}));
vi.mock("fs/promises", () => ({
  default: {
    readFile: vi.fn().mockRejectedValue(new Error("no local config")),
  },
}));
import { GET } from "@/app/api/municipalities-wealth/route";

// 変更前の query 読み取り。キャストは旧挙動を再現するためだけに残す。
function legacyNodeMapping(
  value: string | null | undefined,
  classical: boolean,
) {
  return (value || (classical ? "traditional" : "physical")) as NodeMapping;
}
function legacyPhysicalMonthMode(value: string | null | undefined) {
  return (value || "independent") as "coupled" | "independent";
}

const INVALID = [
  "garbage",
  "phys",
  "TRADITIONAL",
  " physical ",
  " ",
  "toString",
];
const ABSENT = [null, undefined, ""];

describe("query の許される値と既定", () => {
  for (const classical of [true, false]) {
    const fallback = nodeMappingForBoard(classical);
    it.each([...ABSENT, "traditional", "physical"])(
      `古典盤=${classical}: nodeMapping=%s は従来どおり`,
      (raw) => {
        expect(parseNodeMapping(raw, fallback)).toBe(
          legacyNodeMapping(raw, classical),
        );
      },
    );
    it.each(INVALID)(`古典盤=${classical}: 不正値 %s は盤の既定`, (raw) => {
      expect(parseNodeMapping(raw, fallback)).toBe(fallback);
      let changed = 0;
      for (let bearing = 0; bearing < 360; bearing++) {
        const oldDirection = directionFromBearing(
          bearing,
          legacyNodeMapping(raw, classical),
        );
        expect(oldDirection).toBe(directionFromBearing(bearing, "traditional"));
        const newDirection = directionFromBearing(
          bearing,
          parseNodeMapping(raw, fallback),
        );
        if (oldDirection !== newDirection) changed++;
      }
      // 不正値を素通しすると常に伝統区分。独自モデルだけ 60 度ぶん変わる。
      expect(changed).toBe(classical ? 0 : 60);
    });
  }

  it.each([...ABSENT, ...INVALID, "coupled", "independent"])(
    "physicalMonthMode=%s の読み取りと下流の答え",
    (raw) => {
      const parsed = parsePhysicalMonthMode(raw);
      expect(parsed).toBe(raw === "coupled" ? "coupled" : "independent");
      for (let year = 2024; year <= 2026; year++) {
        for (let month = 0; month < 12; month++) {
          const date = new Date(Date.UTC(year, month, 15, 3));
          expect(getPhysicalMonthStar(date, parsed)).toBe(
            getPhysicalMonthStar(date, legacyPhysicalMonthMode(raw)),
          );
        }
      }
    },
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  const point = destinationAtBearing(35, 139, 20, 100);
  findMany.mockResolvedValue([
    {
      id: "1",
      areaCode: "1",
      areaName: "検査地点",
      prefecture: "東京都",
      lat: point.lat,
      lon: point.lon,
      incomePerCapita: 3000000,
    },
  ]);
});

async function query(
  engineType: string,
  nodeMapping: string | null,
  monthMode: string | null,
) {
  const params = new URLSearchParams({
    baseLat: "35",
    baseLon: "139",
    engineType,
    targetDate: "2026-10-09T12:00",
    birthDate: "1990-05-15T12:00",
    lunarPhaseModifier: "false",
  });
  if (nodeMapping !== null) params.set("nodeMapping", nodeMapping);
  if (monthMode !== null) params.set("physicalMonthMode", monthMode);
  const res = await GET(
    new Request(`http://test.local/api/municipalities-wealth?${params}`),
  );
  expect(res.status).toBe(200);
  return res.json();
}

describe("API が parse 関数を通す", () => {
  for (const engine of ["classical", "physical"]) {
    it.each([null, "", ...INVALID, "traditional", "physical"])(
      `${engine}: nodeMapping=%s`,
      async (raw) => {
        const expected = parseNodeMapping(
          raw,
          nodeMappingForBoard(engine === "classical"),
        );
        const actual = await query(engine, raw, null);
        const explicit = await query(engine, expected, "independent");
        expect(actual).toEqual(explicit);
        expect(actual.metadata.nodeMapping).toBe(expected);
        expect(actual.data[0].direction).toBe(
          expected === "physical" ? "N" : "NE",
        );
      },
    );
    it.each([null, "", ...INVALID, "coupled", "independent"])(
      `${engine}: physicalMonthMode=%s`,
      async (raw) => {
        const expected = parsePhysicalMonthMode(raw);
        const actual = await query(engine, null, raw);
        expect(actual).toEqual(await query(engine, null, expected));
        expect(actual.metadata.physicalMonthMode).toBe(expected);
      },
    );
  }
});
