import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { toLogMessage } from "@/lib/errorMessage";
import { AREAS } from "@/lib/areaContent";
import { mergeWithListed } from "@/lib/municipalityCoords";
import {
  DEFAULT_MAX_KM,
  DEFAULT_MIN_KM,
  housingStatsByDirection,
  type HousingStatRow,
} from "@/lib/housingStatsDirections";

/**
 * 出発地から見た**方位ごとの住宅の統計**（借家の家賃・空き家率）を返す。
 *
 * 出どころは `municipality_housing_stats`（e-Stat「統計でみる市区町村の
 * すがた」Ｈ 居住。`scripts/import_estat_housing.ts` で取り込む）。
 * 政府統計の総合窓口の利用規約は CC BY 互換で商用可。**出典・加工の
 * 明記・API のクレジット**を meta で返し、画面がそのまま出す
 * （backlog 26 節）。
 *
 * 集計そのものは `lib/housingStatsDirections` が持つ。ここは最新の
 * 調査年の行を全部読んで、市区町村の代表点と一緒に渡すだけ。行は
 * 市区町村の数（1,900 弱）しか無いので、矩形で絞らない。
 */
export const dynamic = "force-dynamic";

/** 政府統計の総合窓口の API 機能の利用規約が求めるクレジット。文言は変えない。 */
export const ESTAT_API_CREDIT =
  "このサービスは、政府統計総合窓口(e-Stat)のAPI機能を使用していますが、サービスの内容は国によって保証されたものではありません。";

/**
 * 全国の市区町村の代表点（掲載の有無と無関係）。1 度だけ組んで使い回す。
 * 掲載側の座標を優先する理由は `municipalityCoords.mergeWithListed` の註。
 */
let pointsCache: ReturnType<typeof mergeWithListed> | null = null;
function allPoints() {
  pointsCache ??= mergeWithListed(AREAS);
  return pointsCache;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const baseLat = parseFloat(searchParams.get("baseLat") ?? "");
  const baseLon = parseFloat(searchParams.get("baseLon") ?? "");

  /*
    既定値に落とさない。出発地が無いまま東京駅で答えると、画面が
    「登録済み」と読んで保存に流す事故が起きている（#1100・#1114・#1126）。
    物件検索・地価と同じコードと文言で断る。
  */
  if (!Number.isFinite(baseLat) || !Number.isFinite(baseLon)) {
    return NextResponse.json(
      {
        error: "BASE_LOCATION_REQUIRED",
        message:
          "出発地（現在のお住まい）の座標が必要です。方位はここからの向きで決まるため、既定値では判定できません。",
      },
      { status: 400 },
    );
  }

  const maxKm = Math.min(
    Math.max(parseFloat(searchParams.get("maxKm") ?? "") || DEFAULT_MAX_KM, 10),
    500,
  );
  const minKm = Math.max(
    parseFloat(searchParams.get("minKm") ?? "") || DEFAULT_MIN_KM,
    0,
  );

  try {
    /* 最新の調査年だけ。住調は 5 年ごとなので、次の調査を取り込んだら
       自動でそちらに切り替わる */
    const rows = await prisma.$queryRawUnsafe<
      (HousingStatRow & { data_year: number })[]
    >(
      `SELECT area_code, area_name, data_year,
              total_dwellings, vacant_dwellings, rent_per_tatami_yen,
              tatami_per_rental, floor_area_per_rental
         FROM municipality_housing_stats
        WHERE data_year = (SELECT max(data_year) FROM municipality_housing_stats)`,
    );

    const directions = housingStatsByDirection(
      rows,
      allPoints(),
      baseLat,
      baseLon,
      { minKm, maxKm },
    );

    return NextResponse.json({
      directions,
      /** 何を見て出した数字かを画面に書けるようにする */
      meta: {
        municipalitiesScanned: rows.length,
        dataYear: rows[0]?.data_year ?? null,
        minKm,
        maxKm,
        source:
          "「統計でみる市区町村のすがた」（総務省）を加工して作成。出典：政府統計の総合窓口(e-Stat)（https://www.e-stat.go.jp/）",
        credit: ESTAT_API_CREDIT,
      },
    });
  } catch (e) {
    console.error("housing-stats/by-direction:", toLogMessage(e));
    return NextResponse.json(
      {
        error: "HOUSING_STATS_QUERY_FAILED",
        message: "住宅の統計の集計に失敗しました。",
      },
      { status: 500 },
    );
  }
}
