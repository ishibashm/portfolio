import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getGeomagneticData } from "@/utils/geomagnetism";
import {
  computeDeterministicTelemetry,
  parseXrayFlux,
  TELEMETRY_REFERENCE,
} from "@/lib/telemetrySnapshot";
import { toJapanDateString } from "@/utils/japanDate";

/**
 * 履歴グラフのデータ。
 *
 * 以前は orderBy: asc + take: 30 で「最も古い 30 件」を返していた。行が増えても
 * 最初の 30 件を返し続けるため、本番では 2026-06-14〜06-27 の固定表示になり、
 * 2 か月前のデータを「直近」として見せていた。新しい順に取って昇順へ直す。
 *
 * あわせて、グラフが描こうとしている系列を実際に返す。以前は 17 系列のうち
 * kpIndex と magneticF の 2 つしか返しておらず、5 つのグラフのうち 3 つが
 * 完全に空だった。日付から決まる値はここで計算する（@/lib/telemetrySnapshot）。
 */

export const revalidate = 300;

const DAYS = 30;

export async function GET() {
  try {
    const logs = await prisma.telemetryLog.findMany({
      orderBy: { timestamp: "desc" },
      take: DAYS,
    });
    // 表示は古い順。
    logs.reverse();

    // 地磁気は日付ごとにモデルを引く。基準地点は固定。
    const geo = await Promise.all(
      logs.map((log) =>
        getGeomagneticData(
          TELEMETRY_REFERENCE.lat,
          TELEMETRY_REFERENCE.lon,
          log.timestamp.getTime(),
        ).catch(() => null),
      ),
    );

    const data = logs.map((log, i) => {
      const deterministic = computeDeterministicTelemetry(log.timestamp);
      const g = geo[i];

      let xrayFlux: number | null = null;
      if (log.metadata) {
        try {
          const meta = JSON.parse(log.metadata) as { xrayFlux?: string | null };
          xrayFlux = parseXrayFlux(meta.xrayFlux);
        } catch {
          // metadata が壊れていてもグラフは出す
        }
      }

      return {
        date: toJapanDateString(log.timestamp),
        ...deterministic,
        // 観測値（記録されているもの）
        kpIndex: log.kpIndex ?? null,
        xrayFlux,
        // 地磁気（日付と地点から計算）
        magneticF: g?.intensity ?? log.magneticF ?? null,
        magneticD: g?.declination ?? null,
        magneticI: g?.inclination ?? null,
        // 既存の記録値
        geomancyScore: log.geomancyScore ?? null,
        astrophysicsScore: log.astrophysicsScore ?? null,
        hazardRisk: log.hazardRisk ?? null,
        isPersonalVoid: log.isPersonalVoid ? 1 : 0,
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to fetch telemetry history:", error);
    return NextResponse.json(
      { error: "Failed to fetch data" },
      { status: 500 },
    );
  }
}
