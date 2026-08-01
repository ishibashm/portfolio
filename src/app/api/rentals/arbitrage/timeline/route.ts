import { NextResponse } from "next/server";
import {
  getHonmeiStar,
  getPersonalVoidZodiac,
  Direction,
  AstroEngine,
} from "@/utils/ephemerisEngine";
import { getGeomagneticData } from "@/utils/geomagnetism";
import {
  buildDailyAstroStates,
  scoreDateForProperty,
} from "@/utils/arbitrageAstro";

/**
 * 1 物件ぶんの吉凶タイムラインを、指定範囲ぶん実際に計算して返す。
 *
 * 一覧API (/api/rentals/arbitrage) が返す dateScores は対象日±3日の 7 日固定で、
 * ヒートマップの 30days / 12months はその 7 日を使い回して日付ラベルだけ
 * 貼り替えていた（＝表示されていた吉凶は実際の日付のものではなかった）。
 *
 * 一覧APIの日数を増やす手もあるが、500物件×30日ぶんの内訳を毎回返すことになり
 * ペイロードが数MB規模になる。詳細パネルを開いた 1 物件だけ遅延取得する。
 */

function parseSafeDate(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date();
  if (
    dateStr.includes("T") &&
    !dateStr.endsWith("Z") &&
    !/[+-]\d{2}:?\d{2}$/.test(dateStr)
  ) {
    return new Date(dateStr + "+09:00");
  }
  return new Date(dateStr);
}

function getBearing(
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
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function getDirectionFromBearing(
  bearing: number,
  nodeMapping: "traditional" | "physical" = "traditional",
): Direction {
  const b = ((bearing % 360) + 360) % 360;
  if (nodeMapping === "physical") {
    const index = Math.floor(((b + 22.5) % 360) / 45);
    const dirs: Direction[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return dirs[index];
  }
  if (b >= 345 || b < 15) return "N";
  if (b >= 15 && b < 75) return "NE";
  if (b >= 75 && b < 105) return "E";
  if (b >= 105 && b < 165) return "SE";
  if (b >= 165 && b < 195) return "S";
  if (b >= 195 && b < 255) return "SW";
  if (b >= 255 && b < 285) return "W";
  return "NW";
}

/**
 * 30days: 対象日の-3日から+26日。先頭から4番目が対象日になるので、
 *         7days と同じく index 3 を「当日」として扱える。
 * 12months: 対象日と同じ日を 12 ヶ月ぶん。月末日は月の長さに丸める。
 *           「月の代表日」を実在する日付として計算するため、返す date は
 *           必ず実際に計算した日を指す（以前は毎月1日固定のラベルだけだった）。
 */
function buildDateList(targetDate: Date, range: string): Date[] {
  const list: Date[] = [];
  if (range === "12months") {
    // ローカル時刻の年月日から Date を組むとサーバのタイムゾーン次第で
    // dateStr（toISOString 基準）が 1 日ずれる。targetDate を複製して
    // UTC で動かすことで、どのタイムゾーンで動かしても同じ日付になる。
    const day = targetDate.getUTCDate();
    for (let m = 0; m < 12; m++) {
      const d = new Date(targetDate);
      d.setUTCDate(1);
      d.setUTCMonth(targetDate.getUTCMonth() + m);
      const lastDay = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
      ).getUTCDate();
      d.setUTCDate(Math.min(day, lastDay));
      list.push(d);
    }
    return list;
  }

  const span = range === "30days" ? 26 : 3;
  for (let i = -3; i <= span; i++) {
    const d = new Date(targetDate);
    d.setDate(targetDate.getDate() + i);
    list.push(d);
  }
  return list;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    const range = searchParams.get("range") || "30days";
    if (!["7days", "30days", "12months"].includes(range)) {
      return NextResponse.json({ error: "invalid range" }, { status: 400 });
    }

    const baseLat = parseFloat(searchParams.get("baseLat") || "35.6895");
    const baseLon = parseFloat(searchParams.get("baseLon") || "139.6917");
    const propLat = parseFloat(searchParams.get("propLat") || "NaN");
    const propLon = parseFloat(searchParams.get("propLon") || "NaN");
    if (isNaN(propLat) || isNaN(propLon)) {
      return NextResponse.json(
        { error: "propLat / propLon are required" },
        { status: 400 },
      );
    }

    const birthLat = parseFloat(searchParams.get("birthLat") || "NaN");
    const birthLon = parseFloat(searchParams.get("birthLon") || "NaN");
    const bDate = parseSafeDate(searchParams.get("birthDate") || "");
    const hasBirthLocation = !isNaN(birthLat) && !isNaN(birthLon);

    const useClassical = searchParams.get("useClassical") === "true";
    const nodeMapping = (searchParams.get("nodeMapping") ||
      (useClassical ? "traditional" : "physical")) as
      | "traditional"
      | "physical";
    const layerMode = searchParams.get("layerMode") || "year";
    const useTrueNorth = searchParams.get("useTrueNorth") === "true";
    const lunarPhaseModifier =
      searchParams.get("lunarPhaseModifier") !== "false";
    const directionFilterMode =
      searchParams.get("directionFilterMode") || "composite";
    const actionIntent = (searchParams.get("actionIntent") ||
      "MIGRATION") as any;
    const physicalMonthMode = (searchParams.get("physicalMonthMode") ||
      "independent") as "coupled" | "independent";
    const targetDate = parseSafeDate(searchParams.get("targetDate") || "");

    const honmeiStar = getHonmeiStar(bDate);
    const voidZodiacs = getPersonalVoidZodiac(bDate);

    // 一覧APIと同じ偏角を使わないと、同じ物件で方位がずれてしまう。
    let declination = -8.2;
    try {
      const geoData = await getGeomagneticData(
        baseLat,
        baseLon,
        targetDate.getTime(),
      );
      if (geoData && typeof geoData.declination === "number") {
        declination = geoData.declination;
      }
    } catch {
      // 取得できなければ既定値のまま
    }

    const trueBearing = getBearing(baseLat, baseLon, propLat, propLon);
    const direction = getDirectionFromBearing(trueBearing, nodeMapping);
    const magneticDirection = getDirectionFromBearing(
      (trueBearing - declination + 360) % 360,
      nodeMapping,
    );

    // 天体ラインは出生日時・出生地と物件位置で決まり、日付には依存しない
    let hasSunLine = false;
    let hasVenusLine = false;
    let hasJupiterLine = false;
    if (hasBirthLocation) {
      const birthGst = AstroEngine.getGreenwichSiderealTime(bDate);
      const sunLon = AstroEngine.getSolarLongitude(bDate);
      const venusLon = AstroEngine.getVenusLongitude(bDate);
      const jupiterLon = AstroEngine.getJupiterLongitude(bDate);
      const relocatedASC = AstroEngine.getAscendant(
        bDate,
        propLat,
        propLon,
        birthGst,
      );
      const relocatedMC = AstroEngine.getMidheaven(bDate, propLon, birthGst);
      hasSunLine =
        Math.abs(relocatedMC - sunLon) < 5 ||
        Math.abs(relocatedASC - sunLon) < 5;
      hasVenusLine =
        Math.abs(relocatedMC - venusLon) < 5 ||
        Math.abs(relocatedASC - venusLon) < 5;
      hasJupiterLine =
        Math.abs(relocatedMC - jupiterLon) < 5 ||
        Math.abs(relocatedASC - jupiterLon) < 5;
    }

    const dateList = buildDateList(targetDate, range);
    const states = buildDailyAstroStates(dateList, {
      baseLon,
      physicalMonthMode,
      useClassical,
      honmeiStar,
      voidZodiacs,
      actionIntent,
      nodeMapping,
      directionFilterMode,
      layerMode,
      lunarPhaseModifier,
      hasBirthLocation,
      bDate,
    });

    const dateScores = states.map((state) =>
      scoreDateForProperty(state, {
        hasCoordinates: true,
        direction,
        magneticDirection,
        useTrueNorth,
        hasSunLine,
        hasVenusLine,
        hasJupiterLine,
        hasBirthLocation,
        actionIntent,
      }),
    );

    return NextResponse.json({
      range,
      direction,
      magneticDirection,
      dateScores,
    });
  } catch (error: any) {
    console.error("Failed to build arbitrage timeline:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
