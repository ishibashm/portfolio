import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { fetchSpaceWeather } from "@/utils/spaceWeather";
import { getGeomagneticData } from "@/utils/geomagnetism";
import {
  computeDeterministicTelemetry,
  TELEMETRY_REFERENCE,
} from "@/lib/telemetrySnapshot";

/**
 * 1 日 1 回、履歴グラフ用の観測値を記録する。
 *
 * 以前はここが未完成のスタブで、Math.random() の乱数を保存していた
 * （本来の計算はコメントアウトされたまま）。しかも呼び出すスケジューラが
 * 存在せず、本番のデータは 2026-06-27 で止まっていた。
 *
 * 記録するのは「その時刻に観測しないと分からない値」だけでよい。
 * 天体黄経・九星・月相・地磁気は日付から決まるので、読み出し側
 * （/api/telemetry/history）が計算する。
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  // 未設定のときに素通りさせない。以前は "Bearer undefined" が一致して
  // 誰でも書き込めた。
  if (!secret) {
    console.error("CRON_SECRET is not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    // 観測値。外部が落ちていても記録は続ける。
    const weather = await fetchSpaceWeather().catch(() => null);
    const geo = await getGeomagneticData(
      TELEMETRY_REFERENCE.lat,
      TELEMETRY_REFERENCE.lon,
      now.getTime(),
    ).catch(() => null);

    // 参考値として、その日の計算結果も残す（グラフでは使わないが、
    // 後から「その日どう判定していたか」を追えるようにする）。
    const deterministic = computeDeterministicTelemetry(now);

    const log = await prisma.telemetryLog.create({
      data: {
        // 九星の合計は 3〜27。日ごとの気学的な傾きの粗い指標として残す。
        geomancyScore:
          deterministic.yearStar + deterministic.monthStar + deterministic.dayStar,
        astrophysicsScore: deterministic.lunarIllumination,
        magneticF: geo?.intensity ?? null,
        hazardRisk: weather?.kpIndex != null ? weather.kpIndex / 9 : null,
        kpIndex: weather?.kpIndex ?? null,
        isPersonalVoid: false,
        metadata: JSON.stringify({
          source: "cron_batch",
          version: "2.0",
          // 数値（W/m^2）を保存する。等級文字列だけだと 5 段階に丸まる。
          xrayFlux: weather?.xrayFluxValue ?? null,
          xrayClass: weather?.xrayFlux ?? null,
          solarWindSpeed: weather?.solarWindSpeed ?? null,
          magneticD: geo?.declination ?? null,
          magneticI: geo?.inclination ?? null,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      logId: log.id,
      kpIndex: log.kpIndex,
      xrayFlux: weather?.xrayFluxValue ?? null,
      xrayClass: weather?.xrayFlux ?? null,
      magneticF: log.magneticF,
    });
  } catch (error) {
    console.error("Batch Job Failed:", error);
    return NextResponse.json({ error: "Batch job failed" }, { status: 500 });
  }
}
