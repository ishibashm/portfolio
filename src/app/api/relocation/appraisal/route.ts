import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { toLogMessage } from "@/lib/errorMessage";
import {
  CANDIDATE_DEGREES,
  appraise,
  type Comp,
  type SubjectProperty,
} from "@/utils/appraisal";

/**
 * 持ち込み査定（/relocation/appraisal が呼ぶ）。
 *
 * 利用者が入力した 1 件を、近所の成約の分布に当てる。**売出価格を
 * 集めているのではない。**ポータルは規約で収集を禁じているが、
 * 1 件を手で入力して評価するのは収集ではない。
 *
 * ## 誰でも呼べる
 *
 * 返すのは成約価格の集計で、これは国土交通省が公開しているもの。
 * 個人を特定する情報は含まない。管理者に限る理由が無い。
 *
 * ## 引く量を先に絞る
 *
 * property_transactions は 1,948 MB ある。**緯度経度の箱で先に切る。**
 * @@index([lat, lon]) があるのでここは効く。箱の大きさは
 * CANDIDATE_DEGREES（区画 2 つぶん）で、appraisal 側がいちばん広げた段
 * （隣の区画まで）で足りる幅と揃えてある。**ここを狭めると、緩めた段で
 * 候補が足りなくなる。**
 *
 * 年も絞る。分子（売出価格）は今の価格なので、10 年前の成約を混ぜると
 * 実態より安く見える。build_yield_stats.ts と同じ 3 年。
 */

export const dynamic = "force-dynamic";

/** 中古マンションだけ。戸建や土地は㎡の意味が違う。 */
const MANSION_TYPE = "中古マンション等";

/** ㎡単価の外れ値カット。build_purchase_stats.ts と同じ値。 */
const UNIT_PRICE_MIN = 10_000;
const UNIT_PRICE_MAX = 5_000_000;

/** 成約の対象年。最新から数えてこの年数ぶん。 */
const YEARS_BACK = 3;

/**
 * 引く上限。箱で絞ったうえでの保険で、都心だと 1 区画に数千件ある。
 * 中央値を出すのに全件は要らない。
 */
const CANDIDATE_LIMIT = 5000;

type Body = {
  lat?: unknown;
  lon?: unknown;
  areaSqm?: unknown;
  builtYear?: unknown;
  askingPrice?: unknown;
};

type CandidateRow = {
  lat: number;
  lon: number;
  area_sqm: number;
  unit_price_sqm: number;
  building_year: number | null;
  trade_year: number;
};

/** 数値として読めなければ null。文字列で来ても拾う（フォーム経由）。 */
function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** 入力の検証。**駄目な理由を日本語で返す。**画面にそのまま出る。 */
function readSubject(body: Body): SubjectProperty | string {
  const lat = num(body.lat);
  const lon = num(body.lon);
  const areaSqm = num(body.areaSqm);
  if (lat === null || lon === null) return "場所を指定してください。";
  if (lat < 20 || lat > 46 || lon < 122 || lon > 154) {
    return "日本の範囲外の座標です。";
  }
  if (areaSqm === null || areaSqm <= 0) {
    return "専有面積を入れてください（㎡）。";
  }
  if (areaSqm > 1000) return "専有面積が大きすぎます。";

  const builtYear = num(body.builtYear);
  const askingPrice = num(body.askingPrice);
  return {
    lat,
    lon,
    areaSqm,
    /* 分からないなら null。0 を「西暦 0 年」と読ませない。 */
    builtYear: builtYear !== null && builtYear > 1800 ? builtYear : null,
    askingPrice: askingPrice !== null && askingPrice > 0 ? askingPrice : null,
  };
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "JSON として読めませんでした。" },
      { status: 400 },
    );
  }

  const subject = readSubject(body);
  if (typeof subject === "string") {
    return NextResponse.json(
      { success: false, error: subject },
      { status: 400 },
    );
  }

  try {
    const latest = await prisma.$queryRaw<{ latest: number | null }[]>`
      SELECT max(trade_year) AS latest FROM property_transactions
       WHERE property_type = ${MANSION_TYPE}`;
    const yearTo = latest[0]?.latest ?? null;
    if (yearTo === null) {
      return NextResponse.json(
        { success: false, error: "成約価格がまだ取り込まれていません。" },
        { status: 503 },
      );
    }
    const yearFrom = yearTo - (YEARS_BACK - 1);

    const rows = await prisma.$queryRaw<CandidateRow[]>`
      SELECT lat, lon, area_sqm, unit_price_sqm, building_year, trade_year
        FROM property_transactions
       WHERE property_type = ${MANSION_TYPE}
         AND lat BETWEEN ${subject.lat - CANDIDATE_DEGREES}
                     AND ${subject.lat + CANDIDATE_DEGREES}
         AND lon BETWEEN ${subject.lon - CANDIDATE_DEGREES}
                     AND ${subject.lon + CANDIDATE_DEGREES}
         AND unit_price_sqm BETWEEN ${UNIT_PRICE_MIN} AND ${UNIT_PRICE_MAX}
         AND area_sqm > 0
         AND trade_year BETWEEN ${yearFrom} AND ${yearTo}
       LIMIT ${CANDIDATE_LIMIT}`;

    const candidates: Comp[] = rows.map((r) => ({
      lat: r.lat,
      lon: r.lon,
      areaSqm: r.area_sqm,
      unitPriceSqm: r.unit_price_sqm,
      builtYear: r.building_year,
      tradeYear: r.trade_year,
    }));

    const result = appraise(subject, candidates);
    if (!result) {
      /*
        「相場並み」と答えない。出せないときは出せないと言う。
        候補の件数も返す。0 件なのか、あったが条件に合わなかったのかで
        利用者の次の一手が変わる（場所を変えるか、面積を見直すか）。
      */
      return NextResponse.json({
        success: true,
        data: {
          appraisal: null,
          candidatesNearby: candidates.length,
          years: { from: yearFrom, to: yearTo },
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        appraisal: result,
        candidatesNearby: candidates.length,
        years: { from: yearFrom, to: yearTo },
      },
    });
  } catch (e) {
    console.error("査定に失敗:", toLogMessage(e));
    return NextResponse.json(
      { success: false, error: "査定できませんでした。" },
      { status: 500 },
    );
  }
}
