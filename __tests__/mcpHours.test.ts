// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "@/lib/mcpServer";
import { getDailySolarSchedule } from "@/utils/solarTime";
import { evaluateTimePhase, isVoidTimeHour } from "@/lib/timePhase";
import { getHonmeiStar, getPersonalVoidZodiac } from "@/utils/ephemerisEngine";

const close: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(close.splice(0).map((f) => f()));
});
async function connect() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer();
  await server.connect(a);
  const client = new Client({ name: "hours-test", version: "0" });
  await client.connect(b);
  close.push(
    () => client.close(),
    () => server.close(),
  );
  return client;
}
const parse = (r: Awaited<ReturnType<Client["callTool"]>>) =>
  JSON.parse((r.content as { text: string }[])[0].text);

describe("MCP 吉時間", () => {
  it("全十二支が時計の判定・境界と一致する（9星・日本の東西端・年の境目）", async () => {
    const c = await connect();
    for (const year of [1990, 1989, 1988, 1987, 1986, 1985, 1984, 1983, 1982]) {
      for (const lon of [122, 136.9066, 154]) {
        const birthDate = `${year}-06-15`;
        const birth = new Date(`${birthDate}T12:00:00+09:00`);
        const day = new Date("2027-01-01T12:00:00+09:00");
        const out = parse(
          await c.callTool({
            name: "judge_hours",
            arguments: { birthDate, lon, date: "2027-01-01" },
          }),
        );
        const schedule = [-1, 0, 1]
          .flatMap((offset) =>
            getDailySolarSchedule(
              new Date(day.getTime() + offset * 86400000),
              lon,
            ),
          )
          .filter(
            (item) =>
              item.startStandard.getTime() <
                new Date("2027-01-02T00:00:00+09:00").getTime() &&
              item.endStandard.getTime() >
                new Date("2027-01-01T00:00:00+09:00").getTime(),
          );
        expect(out.hours.length).toBeGreaterThanOrEqual(13);
        for (const [i, item] of schedule.entries()) {
          const phase = evaluateTimePhase(item, getHonmeiStar(birth), true);
          const isVoid = isVoidTimeHour(item, getPersonalVoidZodiac(birth));
          expect(out.hours[i].isRecommended).toBe(phase.isOptimal && !isVoid);
          expect(out.hours[i].isVoid).toBe(isVoid);
          expect(out.hours[i].relation).toBe(phase.relation);
          expect(new Date(out.hours[i].start).getTime()).toBe(
            item.startStandard.getTime(),
          );
          expect(new Date(out.hours[i].end).getTime()).toBe(
            item.endStandard.getTime(),
          );
          expect(out.hours[i].start).toMatch(/\+09:00$/);
          expect(out.hours[i]).not.toHaveProperty("hachimon");
        }
        expect(out.hours[0].start.slice(0, 10)).toBe("2026-12-31");
      }
    }
  });
  it("補正の東西端でもJSTの0時と23:59を含み、前後日の刻を取り落とさない", async () => {
    const c = await connect();
    for (const lon of [122, 154]) {
      for (const date of ["2026-02-11", "2026-11-03"]) {
        const out = parse(
          await c.callTool({
            name: "judge_hours",
            arguments: { birthDate: "1990-06-15", lon, date },
          }),
        );
        const midnight = new Date(`${date}T00:00:00+09:00`).getTime();
        for (const instant of [midnight, midnight + 86399999]) {
          expect(
            out.hours.some(
              (row: { start: string; end: string }) =>
                new Date(row.start).getTime() <= instant &&
                instant < new Date(row.end).getTime(),
            ),
          ).toBe(true);
        }
        expect(
          out.hours.some(
            (row: { solarDate: string }) => row.solarDate !== date,
          ),
        ).toBe(true);
        if (lon === 122 && date === "2026-02-11")
          expect(out.hours[0].zodiac).toBe("亥");
      }
    }
  });
  it("推奨時間は指定したJST暦日内に切り、全刻に判定理由を添える", async () => {
    const c = await connect();
    for (const lon of [122, 154]) {
      for (const date of ["2026-02-11", "2026-11-03"]) {
        const out = parse(
          await c.callTool({
            name: "judge_hours",
            arguments: { birthDate: "1990-06-15", lon, date },
          }),
        );
        const midnight = new Date(`${date}T00:00:00+09:00`).getTime();
        const nextMidnight = midnight + 86400000;
        for (const hour of out.hours) {
          const start = new Date(hour.start).getTime();
          const end = new Date(hour.end).getTime();
          const onDateStart = new Date(hour.onDateStart).getTime();
          const onDateEnd = new Date(hour.onDateEnd).getTime();
          expect(onDateStart).toBe(Math.max(start, midnight));
          expect(onDateEnd).toBe(Math.min(end, nextMidnight));
          expect(onDateStart).toBeLessThan(onDateEnd);
          expect(hour.status).toBe(
            hour.isFavorable && !hour.isVoid
              ? "recommended"
              : "not_recommended",
          );
          expect(hour.reasons).toEqual([
            `五行: ${hour.relation}`,
            hour.isVoid
              ? "時の天中殺（空亡）に該当"
              : "時の天中殺（空亡）には該当しない",
          ]);
        }
        expect(out.recommendedWindows).toEqual(
          out.hours
            .filter((hour: { isRecommended: boolean }) => hour.isRecommended)
            .map(
              (hour: {
                zodiac: string;
                eto: string;
                onDateStart: string;
                onDateEnd: string;
                relation: string;
              }) => ({
                zodiac: hour.zodiac,
                eto: hour.eto,
                start: hour.onDateStart,
                end: hour.onDateEnd,
                relation: hour.relation,
              }),
            ),
        );
        expect(out.note).toContain("24個の独立した毎時判定ではありません");
      }
    }
  });
  it("今日をUTCではなくJSTで決め、日付つき時刻もJSTで読む", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T16:00:00Z"));
    const c = await connect();
    const ask = async (date?: string) =>
      parse(
        await c.callTool({
          name: "judge_hours",
          arguments: {
            birthDate: "1984-06-15",
            lon: 136.9066,
            ...(date ? { date } : {}),
          },
        }),
      );
    expect((await ask()).date).toBe("2026-10-11");
    expect((await ask("2026-10-11T20:00")).hours).toEqual(
      (await ask("2026-10-11")).hours,
    );
  });
  it("不正な入力をエラーにする", async () => {
    const c = await connect();
    for (const args of [
      { birthDate: "bad", lon: 135 },
      { birthDate: "2026-02-30", lon: 135 },
      { birthDate: "2026-02-30T12:00", lon: 135 },
      { birthDate: "1990-01-01", lon: 135, date: "2026-02-30" },
      { birthDate: "1990-01-01", lon: 135, date: "2026-02-30T12:00" },
      { birthDate: "1990-01-01", lon: 135, date: "2026-10-11T24:00" },
      { birthDate: "1990-01-01", lon: 135, date: "bad" },
      { birthDate: "1990-01-01", lon: 0 },
    ])
      expect(
        (await c.callTool({ name: "judge_hours", arguments: args })).isError,
      ).toBe(true);
  });
});
