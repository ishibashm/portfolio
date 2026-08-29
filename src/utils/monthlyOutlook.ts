import type { DayTier } from "@/utils/auspiciousDays";
import { TIER_ORDER } from "@/utils/auspiciousDays";
import {
  dayCategory,
  type DayCategory,
  type FilterableDay,
} from "@/lib/timingFilter";

/**
 * 月ごとの見通しを、日ごとの段階から数える。
 *
 * ## なぜ作ったか
 *
 * ここには「Q 値」という別系統の指標が出ていた。利用者の指摘
 * ——「1 月の根拠が他の分析や評価では確認できなかった。サイトでの
 * 一貫性のある評価基準がなくどれを信じていいのか分からない」——で
 * 中身を追ったところ、二つの問題があった。
 *
 * 1. **意味と説明文がずれていた。**Q 値は nbaEngine の
 *    `actionResult.expectedReward`（`maxQ * 50` を -100〜100 に丸めたもの）で、
 *    「その月の質」ではなく**「その月に取るべき最善手の期待値」**だった。
 *    最善手が「撤退」「待機」でも高く出る。実際、3 月は Q=62 で「撤退」、
 *    8 月は Q=41 で「浄化移住」と出ていた。「濃いほど条件が良い月です」
 *    という説明と噛み合っていない
 * 2. **根拠を追える場所が無かった。**サイトの他の画面（/houi・/calendar・
 *    このページのカレンダー・物件スキャナーの地図）はすべて九星気学の
 *    段階評価（S 三盤吉〜X 五大凶殺・天中殺）で動いていて、記事もテストも
 *    そちらに揃っている。Q 値だけが孤立していて、しかも方位を見ていない
 *
 * タスク #8 で「評価軸・重みを廃止する」と決めていたのに、**廃止した
 * 考え方が、後から復活させたこの画面にだけ残っていた**（この予測 API は
 * 元々どこにも描画されず死んでいたものを #513 で出し直した経緯がある）。
 *
 * ## 何を数えるか
 *
 * 段階の判定はしない。**`dayCategory` が返すものをそのまま数える。**
 * これはカレンダーヒートマップが 1 マスを塗るのに使っているのと同じ関数
 * なので、「この月は動ける日が n 日」と「カレンダーで緑のマスが n 個」は
 * 必ず一致する。数え方を別に書くと、また食い違いが生まれる。
 *
 * 天中殺の日は `dayCategory` が段階より先に BLOCKED を返すので、動ける日
 * には入らない。「天中殺の月は質が高くても勧めない」を、注記ではなく
 * 数え方そのもので担保する。
 */

/** 動ける段階。三盤吉・吉2盤・吉1盤。 */
export const OPEN_TIERS: readonly DayTier[] = ["S", "A", "B"];

export interface MonthOutlook {
  /** YYYY-MM */
  month: string;
  year: number;
  /** 1〜12 */
  monthOfYear: number;
  /** 段階ごとの日数。天中殺は BLOCKED に入る。 */
  counts: Record<DayCategory, number>;
  /** この月のうち走査できた日数。月の途中から始まることがある。 */
  total: number;
  /** 動ける日（S・A・B。天中殺の日は入らない）。 */
  open: number;
  /** 動ける日のうち、いちばん良い段階。動ける日が無ければ null。 */
  bestTier: DayTier | null;
}

function emptyCounts(): Record<DayCategory, number> {
  return { S: 0, A: 0, B: 0, C: 0, D: 0, X: 0, BLOCKED: 0 };
}

/** 段階の良さ。TIER_ORDER の並び（S が先頭）をそのまま使う。 */
function tierRank(tier: DayTier): number {
  return TIER_ORDER.indexOf(tier);
}

/**
 * 月ごとに数える。日付の昇順で返す。
 *
 * `fromIso` を渡すと、その日より前を落とす（見通しなので既定では今日以降を
 * 渡す想定）。渡さなければ全部数える。
 */
export function monthlyOutlook(
  days: (FilterableDay & { date: string })[],
  direction: string | null,
  fromIso?: string,
): MonthOutlook[] {
  const byMonth = new Map<string, MonthOutlook>();

  for (const day of days) {
    if (fromIso && day.date < fromIso) continue;
    const month = day.date.slice(0, 7);
    if (month.length !== 7) continue;

    let row = byMonth.get(month);
    if (!row) {
      row = {
        month,
        year: Number(month.slice(0, 4)),
        monthOfYear: Number(month.slice(5, 7)),
        counts: emptyCounts(),
        total: 0,
        open: 0,
        bestTier: null,
      };
      byMonth.set(month, row);
    }

    const category = dayCategory(day, direction);
    row.counts[category]++;
    row.total++;
  }

  for (const row of byMonth.values()) {
    row.open = OPEN_TIERS.reduce((sum, t) => sum + row.counts[t], 0);
    row.bestTier = OPEN_TIERS.find((t) => row.counts[t] > 0) ?? null;
  }

  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * いちばん動ける月。
 *
 * 動ける日が多い順。同数なら段階の良いほうが先で、それも同じなら早い月。
 * **どこにも動ける日が無ければ null。**「いちばんマシな月」を作らないのは、
 * 動けない期間に無理に候補を出すと、勧めていないものを勧めたことになるため。
 */
export function bestOutlookMonth(months: MonthOutlook[]): MonthOutlook | null {
  let best: MonthOutlook | null = null;
  for (const row of months) {
    if (row.open === 0) continue;
    if (!best) {
      best = row;
      continue;
    }
    if (row.open !== best.open) {
      if (row.open > best.open) best = row;
      continue;
    }
    const rank = row.bestTier ? tierRank(row.bestTier) : 99;
    const bestRank = best.bestTier ? tierRank(best.bestTier) : 99;
    if (rank < bestRank) best = row;
  }
  return best;
}
