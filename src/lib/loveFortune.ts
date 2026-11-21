import { currentYearInJapan, STAR_NAMES } from "@/lib/kigakuContent";
import { buildTodayBoard, type TodayBoard } from "@/lib/todayDirections";
import { DIRECTION_LABELS, type CompassDirection } from "@/utils/directionGeo";

export interface LoveFortuneItem {
  star: number;
  name: string;
  lucky: CompassDirection[];
  text: string;
  href: string;
}

export interface LoveFortune {
  date: string;
  center: TodayBoard["center"];
  common: TodayBoard["common"];
  items: LoveFortuneItem[];
}

/**
 * 吉方位に回座する星ごとの短い目安（固定テンプレート）。
 *
 * STAR_MEANINGS の象意（四緑は辞典的な縁談・結婚を含む）のみに基づき、
 * 点数・順位・断定表現は使わない。
 */
const SITTING_STAR_HINT: Record<number, string> = {
  1: "交わりやはじまりの象意",
  2: "土台や地道さの象意",
  3: "発展や音・若さの象意",
  4: "縁談・結婚や信用の象意",
  5: "中心の象意",
  6: "主導や完成の象意",
  7: "悦び・会話・食事の象意",
  8: "変化や節目の象意",
  9: "知性や名誉の象意",
};

const NO_LUCKY_LINE =
  "今日は吉方位はなし。待ち合わせや会合は共通の避けたい方位を外して選ぶのが目安です。";

function buildStarLine(
  lucky: CompassDirection[],
  board: TodayBoard["board"],
): string {
  if (lucky.length === 0) {
    return NO_LUCKY_LINE;
  }
  const dirParts = lucky.map((direction) => {
    const label = DIRECTION_LABELS[direction];
    const hint = SITTING_STAR_HINT[board[direction]];
    return hint ? `${label}（${hint}）` : label;
  });
  return `吉方位は${dirParts.join("・")}。会合や約束の外出先に向きます。`;
}

/**
 * 既存の日盤（TodayBoard）から本命星別の恋愛の目安を組み立てる。
 * 表と同じ日盤を共有したいときはこちらを使う。
 */
export function buildLoveFortuneFromBoard(
  board: TodayBoard,
  year: number = currentYearInJapan(new Date(`${board.date}T12:00:00+09:00`)),
): LoveFortune {
  return {
    date: board.date,
    center: board.center,
    common: board.common,
    items: board.stars.map(({ star, lucky }) => ({
      star,
      name: STAR_NAMES[star],
      lucky,
      text: buildStarLine(lucky, board.board),
      href: `/houi/${year}/${star}`,
    })),
  };
}

/**
 * ホームの「今日の恋愛の目安（本命星別）」用データ。
 *
 * 日盤（buildTodayBoard）と回座星ごとの固定テンプレートから
 * 決定論的に組み立てる。点数・順位・乱数は使わない。
 */
export function buildLoveFortune(now: Date = new Date()): LoveFortune {
  const board = buildTodayBoard(now);
  return buildLoveFortuneFromBoard(board, currentYearInJapan(now));
}
