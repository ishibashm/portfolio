import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { toLogMessage } from "@/lib/errorMessage";
import { LIVE_LISTING_SQL } from "@/lib/rentalListingSql";
import { SCRAPE_TARGETS } from "@/lib/scrapeTargets";

/**
 * 全国俯瞰の県別件数を、絞り込みを掛けた状態で数え直す。
 *
 * 地図の県ラベルはこれまで src/data/prefecturesWithData.json（毎晩
 * build_area_dataset.ts が作る静的な値）だけを見ていた。**絞り込みを
 * どう変えても数字が動かない**ので、条件を足したあとに「まだこの県に
 * これだけあるのか」を読み違える。
 *
 * ここで数えるのは SQL で表せる条件だけ。
 *
 *   数えられる   家賃上限・間取り・築年数上限・徒歩分上限・広さ下限
 *   数えられない 方位、吉凶、総合スコア、利回り偏差、お気に入り
 *
 * 後者は出発地・生年月日から画面側で計算する値で、DB の列に無い。
 * 混ぜて 1 つの数字にすると「方位で絞ったのに減らない」に見えるので、
 * **応答に何で絞ったかを返し、画面はそれを添えて出す。**
 *
 * 基準（掲載中とみなす条件）は build_area_dataset.ts と同じものを
 * lib/rentalListingSql から引く。絞り込みが空のときは静的ファイルと
 * 同じ数字になるはずで、ずれたらどちらかが壊れている。
 *
 * 認証は掛けない。物件の掲載数は公開情報で、この画面自体が匿名で使える。
 * 返すのは県ごとの整数だけで、行の中身は出さない。
 */

export const dynamic = "force-dynamic";

type CountRow = { pref: string; n: number };

/** 数値のクエリ。壊れた値・負の値は「指定なし」に倒す。 */
function positiveNumber(raw: string | null): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

/**
 * 間取りの一致。画面側（filterLayouts）と同じ規則にする。
 *
 * 画面は UPPER した layout の**部分一致**で見ている。ここも同じにする。
 * 前方一致にすると "2LDK" が "ワンルーム2LDK" のような表記を落とし、
 * 同じ条件なのに件数と一覧が食い違う。
 */
function layoutPatterns(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0 && s.length <= 8)
    .slice(0, 20)
    .map((s) => `%${s}%`);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const maxRentMan = positiveNumber(searchParams.get("maxRentMan"));
  const maxBuildingAge = positiveNumber(searchParams.get("maxBuildingAge"));
  const maxStationMin = positiveNumber(searchParams.get("maxStationMin"));
  const minSizeSqm = positiveNumber(searchParams.get("minSizeSqm"));
  const layouts = layoutPatterns(searchParams.get("layouts"));

  const conditions: Prisma.Sql[] = [Prisma.raw(LIVE_LISTING_SQL)];

  // 家賃は「総家賃 = 賃料 + 管理費」で比べる。画面の filterMaxRent と
  // 同じ。賃料だけで比べると、管理費の高い物件が上限内に見える。
  if (maxRentMan !== null) {
    conditions.push(
      Prisma.sql`rent + coalesce(management_fee, 0) <= ${Math.round(maxRentMan * 10000)}`,
    );
  }
  // 未取得（NULL）は落とす。画面側も「条件を満たす保証が無い」として
  // 外している。ここだけ残すと件数が一覧より多く出る。
  if (maxBuildingAge !== null) {
    conditions.push(Prisma.sql`building_age <= ${Math.round(maxBuildingAge)}`);
  }
  if (maxStationMin !== null) {
    conditions.push(
      Prisma.sql`minutes_to_station <= ${Math.round(maxStationMin)}`,
    );
  }
  if (minSizeSqm !== null) {
    conditions.push(Prisma.sql`size_sqm >= ${minSizeSqm}`);
  }
  if (layouts.length > 0) {
    conditions.push(
      Prisma.sql`(${Prisma.join(
        layouts.map((p) => Prisma.sql`upper(coalesce(layout, '')) LIKE ${p}`),
        " OR ",
      )})`,
    );
  }

  const appliedFilters = [
    maxRentMan !== null && "maxRentMan",
    maxBuildingAge !== null && "maxBuildingAge",
    maxStationMin !== null && "maxStationMin",
    minSizeSqm !== null && "minSizeSqm",
    layouts.length > 0 && "layouts",
  ].filter((v): v is string => typeof v === "string");

  const prefNames = SCRAPE_TARGETS.map((t) => t.name);

  try {
    // 県名を配列で渡して 1 回で数える。address には text_pattern_ops の
    // 索引があるので、前方一致は県ごとに索引で引ける（47 回の走査ではなく
    // 47 回の索引引き）。県を跨ぐ行は無いので、合計が二重に数えられる
    // こともない。
    const rows = await prisma.$queryRaw<CountRow[]>`
      SELECT p.name AS pref, count(*)::int AS n
      FROM unnest(${prefNames}::text[]) AS p(name)
      JOIN rental_properties r ON r.address LIKE p.name || '%'
      WHERE ${Prisma.join(conditions, " AND ")}
      GROUP BY p.name`;

    const counts: Record<string, number> = {};
    for (const row of rows) {
      if (row.n > 0) counts[row.pref] = Number(row.n);
    }

    return NextResponse.json({
      success: true,
      data: {
        counts,
        // 画面がそのまま出せるように、何で絞ったかを返す。
        appliedFilters,
        // SQL で表せない絞り込みは反映されていない。画面はこれを見て
        // 「方位・吉凶は含みません」と添える。
        unsupportedFilters: [
          "direction",
          "astrologyStatus",
          "luckyOnly",
          "minTotalScore",
          "minYield",
          "favoritesOnly",
        ],
      },
    });
  } catch (e) {
    console.error("県別件数の集計に失敗:", toLogMessage(e));
    return NextResponse.json(
      { success: false, error: "県別の件数を数えられませんでした。" },
      { status: 500 },
    );
  }
}
