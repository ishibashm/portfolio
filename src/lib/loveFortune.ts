import { currentYearInJapan, STAR_NAMES } from "@/lib/kigakuContent";
import { buildTodayBoard, type TodayBoard } from "@/lib/todayDirections";
import { DIRECTION_LABELS, type CompassDirection } from "@/utils/directionGeo";

export interface LoveFortuneItem {
  star: number;
  name: string;
  lucky: CompassDirection[];
  sitting: string;
  sittingKind: SittingKind;
  action: string;
  luckyHints: { direction: CompassDirection; label: string; hint: string }[];
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

const SHORT_STAR_HINT: Record<number, string> = {
  1: "交わり・はじまり",
  2: "土台・地道さ",
  3: "発展・音・若さ",
  4: "縁談・結婚",
  5: "中心",
  6: "主導・完成",
  7: "会話・食事",
  8: "変化・節目",
  9: "知性・名誉",
};

type SittingKind = "center" | "commonUnlucky" | "normal";

const NO_LUCKY_TEMPLATES: Record<
  SittingKind,
  (placeLabel: string, hint: string) => string
> = {
  center: (placeLabel, hint) =>
    `今日は吉方位はなし。${placeLabel}に回座し、${hint}。遠出より近場や家でのやり取りをていねいに過ごすのが目安です。`,
  commonUnlucky: (placeLabel, hint) =>
    `今日は吉方位はなし。${placeLabel}に回座し、${hint}。その方位への外出は控え、近場や家での連絡をていねいにするのが目安です。`,
  normal: (placeLabel, hint) =>
    `今日は吉方位はなし。${placeLabel}に回座し、${hint}。遠出は控え、近場で過ごしたり連絡をていねいにするのが目安です。`,
};

const NO_LUCKY_ACTION: Record<SittingKind, string> = {
  center: "近場や家でのやり取りをていねいに",
  commonUnlucky: "その方位への外出は控え、近場や家で連絡を",
  normal: "近場で過ごす、連絡をていねいに",
};

const BOARD_CELLS: readonly (CompassDirection | "CENTER")[] = [
  "CENTER",
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
];

function findSittingCell(
  star: number,
  board: TodayBoard["board"],
): CompassDirection | "CENTER" {
  return BOARD_CELLS.find((cell) => board[cell] === star) ?? "CENTER";
}

function buildStarLine(
  star: number,
  lucky: CompassDirection[],
  board: TodayBoard["board"],
  placeLabel: string,
  kind: SittingKind,
): string {
  if (lucky.length === 0) {
    return NO_LUCKY_TEMPLATES[kind](placeLabel, SITTING_STAR_HINT[star] ?? "");
  }
  const dirParts = lucky.map((direction) => {
    const label = DIRECTION_LABELS[direction];
    const hint = SITTING_STAR_HINT[board[direction]];
    return hint ? `${label}（${hint}）` : label;
  });
  return `${placeLabel}に回座。吉方位は${dirParts.join("・")}。会合や約束の外出先に向きます。`;
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
    items: board.stars.map(({ star, lucky }) => {
      const cell = findSittingCell(star, board.board);
      const sitting = cell === "CENTER" ? "中宮" : DIRECTION_LABELS[cell];
      const sittingKind =
        cell === "CENTER"
          ? "center"
          : board.common.some((item) => item.direction === cell)
            ? "commonUnlucky"
            : "normal";
      return {
        star,
        name: STAR_NAMES[star],
        lucky,
        sitting,
        sittingKind,
        action: lucky.length
          ? "会合や約束の外出先に"
          : NO_LUCKY_ACTION[sittingKind],
        luckyHints: lucky.map((direction) => ({
          direction,
          label: DIRECTION_LABELS[direction],
          hint: SHORT_STAR_HINT[board.board[direction]] ?? "",
        })),
        text: buildStarLine(star, lucky, board.board, sitting, sittingKind),
        href: `/houi/${year}/${star}`,
      };
    }),
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
