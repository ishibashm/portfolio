import { NextResponse } from "next/server";
import { toResponseMessage } from "@/lib/errorMessage";
import {
  getHonmeiStar,
  getPersonalVoidZodiac,
  Direction,
  AstroEngine,
  parseActionIntent,
  parseDirectionFilterMode,
} from "@/utils/ephemerisEngine";
import { getGeomagneticData } from "@/utils/geomagnetism";
import { directionFromBearing } from "@/utils/directionGeo";
import {
  buildDailyAstroStates,
  scoreDateForProperty,
  isAvoidStatus,
} from "@/utils/arbitrageAstro";
import {
  DEFAULT_TENCHUSATSU_MODE,
  TenchusatsuMode,
  isTenchusatsuMode,
} from "@/utils/tenchusatsuPolicy";
import {
  DEFAULT_PARTY_POLICY,
  PartyMember,
  PartyPolicy,
  combineOutcomes,
  isPartyPolicy,
  parsePartyParam,
  partyWeights,
  summarizeTiming,
} from "@/utils/arbitrageParty";

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

/**
 * 30days: 対象日の-3日から+26日。先頭から4番目が対象日になるので、
 *         7days と同じく index 3 を「当日」として扱える。
 * 90days: 同じ考え方で 3 ヶ月ぶん。合流のように全員の都合が合う日を
 *         探す場合、30 日では 1 日も開かないことがある。
 * 12months / 24months:
 *           対象日と同じ日を月ぶん。月末日は月の長さに丸める。
 *           「月の代表日」を実在する日付として計算するため、返す date は
 *           必ず実際に計算した日を指す（以前は毎月1日固定のラベルだけだった）。
 */
function buildDateList(targetDate: Date, range: string): Date[] {
  const list: Date[] = [];
  if (range === "12months" || range === "24months") {
    const months = range === "24months" ? 24 : 12;
    // ローカル時刻の年月日から Date を組むとサーバのタイムゾーン次第で
    // dateStr（toISOString 基準）が 1 日ずれる。targetDate を複製して
    // UTC で動かすことで、どのタイムゾーンで動かしても同じ日付になる。
    const day = targetDate.getUTCDate();
    for (let m = 0; m < months; m++) {
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

  const span = range === "90days" ? 86 : range === "30days" ? 26 : 3;
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
    if (
      !["7days", "30days", "90days", "12months", "24months"].includes(range)
    ) {
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
    /*
      知らない値は composite（＝指定が無いときと同じ）に落とす。
      素通しだと filterCollisionByMode の else に落ちて environmental に
      なり、「無いときは composite なのに壊れていると environmental」
      という筋の通らない挙動になっていた（__tests__/directionFilterMode）。
    */
    const directionFilterMode = parseDirectionFilterMode(
      searchParams.get("directionFilterMode"),
    );
    /*
      知らない値は DEFAULT。これは挙動を変えない——判定は
      `=== "REST"` / `=== "BUSINESS"` / `=== "MIGRATION"` でしか見ておらず、
      それ以外は今も暗黙の else（＝DEFAULT）に落ちている（#542）。
      値が無いときの既定 MIGRATION とは別に渡す。一緒にすると壊れた値が
      移転扱いに化ける。
    */
    const actionIntent = parseActionIntent(
      searchParams.get("actionIntent"),
      "MIGRATION",
    );
    const physicalMonthMode = (searchParams.get("physicalMonthMode") ||
      "independent") as "coupled" | "independent";
    const targetDate = parseSafeDate(searchParams.get("targetDate") || "");

    const tenchusatsuRaw =
      searchParams.get("tenchusatsuMode") || DEFAULT_TENCHUSATSU_MODE;
    const tenchusatsuMode: TenchusatsuMode = isTenchusatsuMode(tenchusatsuRaw)
      ? tenchusatsuRaw
      : DEFAULT_TENCHUSATSU_MODE;
    const involuntaryMove = searchParams.get("involuntaryMove") === "true";

    const partyPolicyRaw =
      searchParams.get("partyPolicy") || DEFAULT_PARTY_POLICY;
    const partyPolicy: PartyPolicy = isPartyPolicy(partyPolicyRaw)
      ? partyPolicyRaw
      : DEFAULT_PARTY_POLICY;

    /**
     * 判定に関わる人。先頭は必ず本人。
     * 一覧API と同じ構成にしないと、カレンダーだけ 1 人分の判定になり、
     * 一覧では避けるべきとされた日が「動ける日」として出てしまう。
     */
    const party: PartyMember[] = [
      {
        id: "primary",
        name: (searchParams.get("selfName") || "あなた").slice(0, 40),
        birthDate: searchParams.get("birthDate") || "",
        birthLat: hasBirthLocation ? birthLat : null,
        birthLon: hasBirthLocation ? birthLon : null,
        baseLat,
        baseLon,
        weight: 1,
        stationary: false,
      },
      ...parsePartyParam(searchParams.get("party")).filter(
        (m) => m.id !== "primary",
      ),
    ];
    const memberWeights = partyWeights(party);
    const dateList = buildDateList(targetDate, range);

    // 一覧APIと同じ偏角を使わないと、同じ物件で方位がずれてしまう。
    // 偏角は出発地ごとに違うので人ごとに引く。
    const declinations = await Promise.all(
      party.map(async (m) => {
        try {
          const geoData = await getGeomagneticData(
            m.baseLat,
            m.baseLon,
            targetDate.getTime(),
          );
          if (geoData && typeof geoData.declination === "number") {
            return geoData.declination;
          }
        } catch {
          // 取得できなければ補正なしで扱う
        }
        // 取得できなかったときは 0（＝補正なし）に倒す。以前は東京の -8.2 度を
        // 既定にしていたが、沖縄や北海道の利用者にも東京の偏角で計算した磁北の
        // 方位を見せることになる。判定は真北で行うのでここは注意表示にしか
        // 効かず、分からないときは「ずれない」として注意を出さないほうが正しい。
        return 0;
      }),
    );

    /** 人ごとの日別スコア列。出発地が違えば方位が違うので別々に出す。 */
    const perMember = party.map((member, index) => {
      const memberBDate = parseSafeDate(member.birthDate);
      const memberHasBirth =
        member.birthLat !== null && member.birthLon !== null;

      if (member.stationary) {
        return {
          member,
          direction: null as Direction | null,
          magneticDirection: null as Direction | null,
          days: [] as ReturnType<typeof scoreDateForProperty>[],
        };
      }

      const bearing = getBearing(
        member.baseLat,
        member.baseLon,
        propLat,
        propLon,
      );
      const memberDirection = directionFromBearing(bearing, nodeMapping);
      const memberMagnetic = directionFromBearing(
        (bearing - declinations[index] + 360) % 360,
        nodeMapping,
      );

      // 天体ラインは出生日時・出生地と物件位置で決まり、日付には依存しない
      let hasSunLine = false;
      let hasVenusLine = false;
      let hasJupiterLine = false;
      if (memberHasBirth) {
        const birthGst = AstroEngine.getGreenwichSiderealTime(memberBDate);
        const sunLon = AstroEngine.getSolarLongitude(memberBDate);
        const venusLon = AstroEngine.getVenusLongitude(memberBDate);
        const jupiterLon = AstroEngine.getJupiterLongitude(memberBDate);
        const relocatedASC = AstroEngine.getAscendant(
          memberBDate,
          propLat,
          propLon,
          birthGst,
        );
        const relocatedMC = AstroEngine.getMidheaven(
          memberBDate,
          propLon,
          birthGst,
        );
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

      const states = buildDailyAstroStates(dateList, {
        baseLon: member.baseLon,
        physicalMonthMode,
        useClassical,
        honmeiStar: getHonmeiStar(memberBDate),
        voidZodiacs: getPersonalVoidZodiac(memberBDate),
        actionIntent,
        nodeMapping,
        directionFilterMode,
        layerMode,
        lunarPhaseModifier,
        hasBirthLocation: memberHasBirth,
        bDate: memberBDate,
      });

      return {
        member,
        direction: memberDirection,
        magneticDirection: memberMagnetic,
        days: states.map((state) =>
          scoreDateForProperty(state, {
            hasCoordinates: true,
            direction: memberDirection,
            magneticDirection: memberMagnetic,
            useTrueNorth,
            hasSunLine,
            hasVenusLine,
            hasJupiterLine,
            hasBirthLocation: memberHasBirth,
            actionIntent,
            tenchusatsuMode,
            involuntaryMove,
          }),
        ),
      };
    });

    const primary = perMember[0];

    const jointByDay = dateList.map((_, i) =>
      combineOutcomes(
        perMember.map((m) => {
          const day = m.days[i];
          return {
            memberId: m.member.id,
            name: m.member.name,
            direction: m.direction,
            magneticDirection: m.magneticDirection,
            distanceKm: null,
            score: day?.score ?? 0,
            status: day?.status ?? "UNKNOWN",
            isAvoid: day ? isAvoidStatus(day.status) : false,
            maxFactor: day?.status ?? "UNKNOWN",
          };
        }),
        partyPolicy,
        memberWeights,
      ),
    );

    /**
     * カレンダーに渡す系列。1 人なら従来どおり本人の判定そのまま。
     * 同行者がいる場合は、通れない人がいる日を「行ける日」として見せない
     * ため、一番厳しい人の判定を採って点だけ合成値に差し替える。
     */
    const dateScores = primary.days.map((day, i) => {
      const joint = jointByDay[i];
      if (party.length === 1 || !joint.bindingMember) return day;
      const binding = perMember.find(
        (m) => m.member.id === joint.bindingMember!.memberId,
      );
      const bindingDay = binding?.days[i] ?? day;
      return {
        ...bindingDay,
        date: day.date,
        rokuyo: day.rokuyo,
        luckyDays: day.luckyDays,
        score: joint.score,
      };
    });

    return NextResponse.json({
      range,
      direction: primary.direction,
      magneticDirection: primary.magneticDirection,
      dateScores,
      /** 人ごとの方位と日別スコア。誰がどの日に引っかかるかを画面で出す。 */
      members: perMember.map((m) => ({
        id: m.member.id,
        name: m.member.name,
        direction: m.direction,
        magneticDirection: m.magneticDirection,
        stationary: m.member.stationary,
        scores: m.days.map((d, i) => ({
          date: dateScores[i]?.date ?? d.date,
          score: d.score,
          status: d.status,
          isAvoid: isAvoidStatus(d.status),
        })),
      })),
      /** 全員が動ける日の一覧と、直近の 1 日。 */
      timing: summarizeTiming(
        jointByDay.map((joint, i) => ({
          date: dateScores[i]?.date ?? "",
          joint,
        })),
      ),
      allClearDates: jointByDay
        .map((joint, i) => (joint.everyoneSafe ? dateScores[i]?.date : null))
        .filter((d): d is string => !!d),
    });
  } catch (error) {
    console.error("Failed to build arbitrage timeline:", error);
    return NextResponse.json(
      { error: toResponseMessage(error, "Failed to build arbitrage timeline") },
      { status: 500 },
    );
  }
}
