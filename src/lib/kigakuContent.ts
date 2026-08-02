/**
 * 検索から入ってくる人向けの、方位に関する静的コンテンツを組み立てる。
 *
 * 数値はすべて src/utils/ephemerisEngine.ts の計算結果をそのまま使う。
 * ここで独自に定数表を持つと、ツール側の判定と食い違う記事ができてしまう。
 */
import {
  generateBoard,
  getClassicalYearStar,
  getClassicalMonthStar,
  getClassicalDayStar,
  calculateVectorCollision,
  type Direction,
  type StarFrequency,
} from "@/utils/ephemerisEngine";

/**
 * ここでは必ず「古典」の九星（getClassicalYearStar 系）を使う。
 *
 * エンジンには木星の黄経から求める独自モデル（getYearStar）もあるが、
 * それで表を作ると 9 年周期にならず、世間の九星気学の資料と数字が合わない。
 * 例: 1980年生まれは古典で二黒土星、独自モデルでは六白金星になる。
 * 検索から来る人が照合するのは古典のほうなので、記事は古典に揃える。
 */

// Direction 型には CENTER（中宮）も含まれるが、方位としては扱わない。
// as const で 8 方位だけに絞った型を作り、対応表の網羅漏れを型で防ぐ。
export const DIRECTIONS = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
] as const satisfies readonly Direction[];

export type CompassDirection = (typeof DIRECTIONS)[number];

// Direction には CENTER（中宮）が含まれるが、方位としては扱わないので除く
export const DIRECTION_LABELS: Record<CompassDirection, string> = {
  N: "北",
  NE: "北東",
  E: "東",
  SE: "南東",
  S: "南",
  SW: "南西",
  W: "西",
  NW: "北西",
};

export const STAR_NAMES: Record<number, string> = {
  1: "一白水星",
  2: "二黒土星",
  3: "三碧木星",
  4: "四緑木星",
  5: "五黄土星",
  6: "六白金星",
  7: "七赤金星",
  8: "八白土星",
  9: "九紫火星",
};

export const STARS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** 判定コードを日本語の名称と説明に対応させる */
export const STATUS_INFO: Record<
  string,
  { label: string; kind: "good" | "neutral" | "bad"; note: string }
> = {
  OPTIMAL: {
    label: "吉方位",
    kind: "good",
    note: "本命星と相性の良い星が回座しており、凶方位にも当たっていません。",
  },
  OPTIMAL_REGULAR: {
    label: "吉方位",
    kind: "good",
    note: "本命星と相性の良い星が回座しており、凶方位にも当たっていません。",
  },
  SAFE: {
    label: "平",
    kind: "neutral",
    note: "凶方位ではありませんが、積極的に選ぶ理由もない方位です。",
  },
  WARNING: {
    label: "注意",
    kind: "neutral",
    note: "条件によって評価が変わる方位です。",
  },
  NOISE_GOU: {
    label: "五黄殺",
    kind: "bad",
    note: "五黄土星が回座する方位。九星気学では最も避けるべき方位とされます。",
  },
  NOISE_ANKEN: {
    label: "暗剣殺",
    kind: "bad",
    note: "五黄殺の正反対にあたる方位。五黄殺と対で生じます。",
  },
  NOISE_HA: {
    label: "歳破",
    kind: "bad",
    note: "その年の十二支の正反対にあたる方位。約束事が壊れる方位とされます。",
  },
  NOISE_HONMEI: {
    label: "本命殺",
    kind: "bad",
    note: "自分の本命星そのものが回座する方位。自身に影響が出るとされます。",
  },
  NOISE_TEKI: {
    label: "本命的殺",
    kind: "bad",
    note: "本命殺の正反対にあたる方位。本命殺と対で生じます。",
  },
  NOISE_GETSUMEI: {
    label: "月命殺",
    kind: "bad",
    note: "月命星が回座する方位。月単位で影響するとされます。",
  },
  NOISE_GETSUTEKI: {
    label: "月命的殺",
    kind: "bad",
    note: "月命殺の正反対にあたる方位です。",
  },
  NOISE_VOID: {
    label: "空亡",
    kind: "bad",
    note: "十二支の欠けにあたる方位です。",
  },
  NOISE_NODE: {
    label: "月交点",
    kind: "bad",
    note: "月の軌道交点にあたる方位です。",
  },
};

export function statusInfo(status: string) {
  return (
    STATUS_INFO[status] ?? {
      label: "判定なし",
      kind: "neutral" as const,
      note: "この方位に特筆すべき条件はありません。",
    }
  );
}

export interface DirectionVerdict {
  direction: CompassDirection;
  jp: string;
  status: string;
  label: string;
  kind: "good" | "neutral" | "bad";
  note: string;
  /** その方位に回座している星 */
  star: number | null;
}

/**
 * その年・その本命星における年盤の方位一覧。
 *
 * 九星気学の一年は立春（2月4日ごろ）で切り替わる。ここでは年の途中の
 * 日付を渡して「その年」を代表させているため、1月1日〜立春前は
 * 前年の盤になる点を利用者に伝える必要がある。
 */
export function getYearDirections(
  year: number,
  star: number,
): { centerStar: StarFrequency; verdicts: DirectionVerdict[] } {
  const d = new Date(Date.UTC(year, 5, 1));
  const centerStar = getClassicalYearStar(d);
  const yearBoard = generateBoard(centerStar);
  const monthBoard = generateBoard(getClassicalMonthStar(d));
  const dayBoard = generateBoard(getClassicalDayStar(d));

  const collision = calculateVectorCollision(
    star as StarFrequency,
    yearBoard,
    monthBoard,
    dayBoard,
    [],
    null,
    "MIGRATION",
    d,
  );

  const verdicts = DIRECTIONS.map((direction) => {
    const status = collision.yearLayer[direction] ?? "SAFE";
    const info = statusInfo(status);
    return {
      direction,
      jp: DIRECTION_LABELS[direction],
      status,
      label: info.label,
      kind: info.kind,
      note: info.note,
      star: (yearBoard as Record<string, number>)[direction] ?? null,
    };
  });

  return { centerStar, verdicts };
}

/**
 * 生まれ年から本命星を引く。
 * 立春前の生まれは前年扱いになるため、表示側で必ず注記すること。
 */
export function starForBirthYear(year: number): number {
  return getClassicalYearStar(new Date(Date.UTC(year, 5, 1)));
}

/** 記事を用意する年。ビルド時に静的生成する対象になる。 */
export function contentYears(): number[] {
  const current = new Date().getFullYear();
  return [current, current + 1, current + 2];
}
