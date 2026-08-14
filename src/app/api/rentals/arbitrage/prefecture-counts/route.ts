import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { toLogMessage } from "@/lib/errorMessage";
import {
  buildCountFilters,
  UNSUPPORTED_COUNT_FILTERS,
} from "@/lib/rentalCountFilters";
import { SCRAPE_TARGETS } from "@/lib/scrapeTargets";

/**
 * 全国俯瞰の県別件数を、絞り込みを掛けた状態で数え直す。
 *
 * 地図の県ラベルはこれまで src/data/prefecturesWithData.json（毎晩
 * build_area_dataset.ts が作る静的な値）だけを見ていた。**絞り込みを
 * どう変えても数字が動かない**ので、条件を足したあとに「まだこの県に
 * これだけあるのか」を読み違える。
 *
 * 条件の組み立ては lib/rentalCountFilters に置いてある。表示範囲で
 * 数える口（viewport-count）と同じ規則を使わないと、県の合計と
 * 表示範囲の数が食い違う。
 *
 * 認証は掛けない。物件の掲載数は公開情報で、この画面自体が匿名で使える。
 * 返すのは県ごとの整数だけで、行の中身は出さない。
 */

export const dynamic = "force-dynamic";

type CountRow = { pref: string; n: number };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { conditions, appliedFilters } = buildCountFilters(searchParams);

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
        unsupportedFilters: [...UNSUPPORTED_COUNT_FILTERS],
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
