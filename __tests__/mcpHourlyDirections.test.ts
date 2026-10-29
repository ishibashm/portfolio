// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => {
  throw new Error("Public calculation must not load DB");
});
vi.mock("@/utils/supabase/server", () => {
  throw new Error("Public calculation must not load login");
});
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "@/lib/mcpServer";
import {
  calculateTimeDirections,
  timeDirectionsOutputSchema,
  timeDirectionsInputSchema,
} from "@/lib/timeDirections";
import { calculateTimeSlots } from "@/lib/timeSlots";
import { getKyusei } from "@/utils/kigaku";
import { AREAS } from "@/lib/areaContent";
import { municipalityMatches } from "@/lib/municipalitySearch";
import readings from "@/data/municipalityReadings.json";

const date = "2026-10-24";
const birthDate = "1990-04-15";

async function withClient(run: (client: Client) => Promise<void>) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer();
  const client = new Client({ name: "hourly-test", version: "1" });
  await server.connect(a);
  await client.connect(b);
  try {
    await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

describe("公開MCPの時盤", () => {
  it("SDK経由で出力スキーマに合う12刻・八方位・既存色を返す", async () => {
    await withClient(async (client) => {
      const result = await client.callTool({
        name: "judge_hourly_directions",
        arguments: { date, birthDate },
      });
      expect(result.isError).not.toBe(true);
      const out = timeDirectionsOutputSchema.parse(result.structuredContent);
      expect(
        JSON.parse((result.content as { text: string }[])[0].text),
      ).toEqual(out);
      expect(out.location).toEqual({ lat: 35.1815, lon: 136.9064 });
      expect(out.honmeiStar).toBe(1);
      expect(out.slots).toHaveLength(12);
      for (const slot of out.slots) {
        expect(new Set(slot.directions.map((d) => d.direction)).size).toBe(8);
        expect(slot.luckyColor).toBe(getKyusei(slot.hourStar.number).color);
      }
    });
  });

  it.each([122, 136.9064, 154])(
    "経度%sでjudge_time_slotsと境界・九星配置が一致",
    (lon) => {
      const location = { lat: 35.1815, lon };
      const out = calculateTimeDirections({ date, birthDate, location });
      const old = calculateTimeSlots({
        date,
        birthDate,
        ...location,
        includeBoard: true,
      });
      expect(out.coverage).toEqual(old.coverage);
      out.slots.forEach((slot, i) => {
        expect([
          slot.start,
          slot.end,
          slot.hourStar,
          slot.branch,
          slot.stemBranch,
        ]).toEqual([
          old.slots[i].start,
          old.slots[i].end,
          old.slots[i].hourStar,
          old.slots[i].branch,
          old.slots[i].stemBranch,
        ]);
        slot.directions.forEach((d) =>
          expect(d.star).toEqual(old.slots[i].board![d.direction]),
        );
      });
    },
  );

  it.each([undefined, 1, 2, 3, 4, 5, 6, 7, 8, 9])(
    "本命星%sでも五黄殺・反対側の暗剣殺は必ず凶",
    (honmeiStar) => {
      const out = calculateTimeDirections({ date, honmeiStar });
      const opposites = {
        N: "S",
        NE: "SW",
        E: "W",
        SE: "NW",
        S: "N",
        SW: "NE",
        W: "E",
        NW: "SE",
      };
      let hazards = 0;
      for (const slot of out.slots) {
        const gou = slot.directions.find((d) => d.star.number === 5);
        if (gou) {
          hazards++;
          expect(gou).toMatchObject({
            status: "unfavorable",
            reason: "NOISE_GOU",
          });
          expect(
            slot.directions.find(
              (d) => d.direction === opposites[gou.direction],
            ),
          ).toMatchObject({ status: "unfavorable", reason: "NOISE_ANKEN" });
        } else {
          expect(slot.hourStar.number).toBe(5);
          expect(
            slot.directions.some((d) =>
              ["NOISE_GOU", "NOISE_ANKEN"].includes(d.reason),
            ),
          ).toBe(false);
        }
        if (honmeiStar === undefined) {
          expect(
            slot.directions.every(
              (d) =>
                d.status === "unfavorable" ||
                (d.status === "neutral" && d.reason === "SAFE"),
            ),
          ).toBe(true);
        }
      }
      expect(hazards).toBeGreaterThan(0);
    },
  );

  it("出生と本命星の指定は等価で、曖昧・不正入力は拒否", async () => {
    expect(calculateTimeDirections({ date, birthDate })).toEqual(
      calculateTimeDirections({ date, honmeiStar: 1 }),
    );
    for (const input of [
      { date, birthDate, honmeiStar: 1 },
      { date: "2026-02-30" },
      { date, location: { lon: 136 } },
      { date, profileId: "saved" },
      { date, honmeiStar: 10 },
    ]) {
      expect(timeDirectionsInputSchema.safeParse(input).success).toBe(false);
    }
    await withClient(async (client) => {
      expect(
        (
          await client.callTool({
            name: "judge_hourly_directions",
            arguments: { date, birthDate, honmeiStar: 1 },
          })
        ).isError,
      ).toBe(true);
    });
  });
});

describe("自治体の読み検索", () => {
  it.each(["Nagoya", "nagoya", "なごや", "ナゴヤ"])(
    "%sは漢字検索と同じ名古屋市・区を返す",
    async (query) => {
      await withClient(async (client) => {
        const call = async (q: string) => {
          const result = await client.callTool({
            name: "search_municipality",
            arguments: { query: q, limit: 50 },
          });
          return JSON.parse((result.content as { text: string }[])[0].text);
        };
        const out = await call(query);
        expect(out.results).toEqual((await call("名古屋")).results);
        expect(out.count).toBe(17);
        expect(
          out.results.some((r: { name: string }) =>
            r.name.startsWith("愛知県名古屋市"),
          ),
        ).toBe(true);
      });
    },
  );
  it.each([
    ["Tokyo", "Toukyou", "Tōkyō", "とうきょう", "トーキョー"],
    ["Osaka", "Oosaka", "Ōsaka", "おおさか", "オーサカ"],
    ["Fukushima", "Hukusima", "ふくしま", "フクシマ"],
    ["Chiba", "Tiba", "ちば", "チバ"],
    ["Nagoya shi", "Nagoya-si", "なごやし", "ナゴヤシ"],
  ])("長音・綴りを吸収: %s", (...queries) => {
    const codes = (q: string) =>
      AREAS.filter((a) => municipalityMatches(a, q)).map((a) => a.code);
    expect(codes(queries[0]).length).toBeGreaterThan(0);
    queries.forEach((q) => expect(codes(q)).toEqual(codes(queries[0])));
  });
  it("全掲載自治体に出典付き読みがあり、空白や記号だけでは全件一致しない", () => {
    for (const a of AREAS) {
      const r = readings.municipalities.find(
        (r) => r.pref === a.pref && r.city === a.city,
      );
      expect(r?.cityKana).toBeTruthy();
      expect(r?.cityRoman).toBeTruthy();
    }
    for (const q of [" ", "---", "ー", "存在しない自治体XYZ"]) {
      expect(AREAS.filter((a) => municipalityMatches(a, q))).toEqual([]);
    }
  });
});
