/**
 * 時間帯（2 時間ごとの十二支）の吉凶を決める、唯一の判定。
 *
 * これまで SolarTimeTable の中だけに置かれていた。ホームのポータル
 * （home/HomePortal）が「今の時間帯は動いてよいか」を要点として出す
 * ようになり、同じ判定を 2 か所で持つことになったので集約した。
 * **中身は 1 文字も変えていない。**数値・条件式は判定の見え方を
 * 決めるので触らない（CLAUDE.md 3 節）。
 */

import type { KimonScheduleItem } from "@/utils/solarTime";

/** 五行の属性。表示の色までここで持つ（元の実装のまま）。 */
export interface ElementInfo {
  id: "Water" | "Earth" | "Wood" | "Metal" | "Fire";
  name: string;
  color: string;
}

export interface TimePhase {
  /** 八門が吉門で、かつ五行が相生・相比のとき true。緑の帯を出す条件。 */
  isOptimal: boolean;
  isFavorable?: boolean;
  isGoodGate?: boolean;
  myElement: ElementInfo | null;
  timeElement: ElementInfo | null;
  relation: string | null;
}

/**
 * その時間帯が天中殺（空亡）に当たるか。
 *
 * 生年月日が未入力で天中殺が出せないときは、午・未（11:00〜15:00）を
 * 既定として扱う。元の実装のまま。
 */
export function isVoidTimeHour(
  item: KimonScheduleItem,
  personalVoidZodiac?: string[],
): boolean {
  if (personalVoidZodiac && personalVoidZodiac.length > 0) {
    return personalVoidZodiac.includes(item.japanese);
  }
  return item.japanese === "午" || item.japanese === "未"; // 11:00 - 15:00
}

export function getElementInfo(starNum: number): ElementInfo {
  if (starNum === 1) return { id: "Water", name: "水", color: "text-blue-600" };
  if ([2, 5, 8].includes(starNum))
    return { id: "Earth", name: "土", color: "text-amber-600" };
  if ([3, 4].includes(starNum))
    return { id: "Wood", name: "木", color: "text-emerald-600" };
  if ([6, 7].includes(starNum))
    return { id: "Metal", name: "金", color: "text-stone-600" };
  if (starNum === 9) return { id: "Fire", name: "火", color: "text-red-500" };
  return { id: "Earth", name: "土", color: "text-amber-600" }; // fallback
}

export function evaluateTimePhase(
  item: KimonScheduleItem,
  honmeiStar: { classical?: number | null; physical?: number | null } | null,
  useClassical: boolean,
): TimePhase {
  const isGoodGate = item.hachimon.auspicious; // 生, 休, 開

  if (!honmeiStar)
    return {
      isOptimal: false,
      myElement: null,
      timeElement: null,
      relation: null,
    };
  const activeStar = useClassical ? honmeiStar.classical : honmeiStar.physical;
  if (!activeStar)
    return {
      isOptimal: false,
      myElement: null,
      timeElement: null,
      relation: null,
    };

  const myElement = getElementInfo(activeStar);
  const timeElementNum =
    item.kyusei.number || parseInt(item.kyusei.japanese.substring(0, 1)) || 3;
  const timeElement = getElementInfo(timeElementNum);

  let relation = null;
  let isFavorable = false;

  // 相生・相比・相剋の完全判定 (五行理論)
  if (myElement.id === timeElement.id) {
    relation = "相比 (比和: 同調)";
    isFavorable = true;
  }
  // 木 (Wood)
  else if (myElement.id === "Wood" && timeElement.id === "Water") {
    relation = "水生木 (相生: 吸収)";
    isFavorable = true;
  } else if (myElement.id === "Wood" && timeElement.id === "Fire") {
    relation = "木生火 (相生: 放出)";
    isFavorable = true;
  } else if (myElement.id === "Wood" && timeElement.id === "Earth") {
    relation = "木剋土 (相剋: 衝突)";
    isFavorable = false;
  } else if (myElement.id === "Wood" && timeElement.id === "Metal") {
    relation = "金剋木 (相剋: 破壊)";
    isFavorable = false;
  }
  // 火 (Fire)
  else if (myElement.id === "Fire" && timeElement.id === "Wood") {
    relation = "木生火 (相生: 吸収)";
    isFavorable = true;
  } else if (myElement.id === "Fire" && timeElement.id === "Earth") {
    relation = "火生土 (相生: 放出)";
    isFavorable = true;
  } else if (myElement.id === "Fire" && timeElement.id === "Metal") {
    relation = "火剋金 (相剋: 衝突)";
    isFavorable = false;
  } else if (myElement.id === "Fire" && timeElement.id === "Water") {
    relation = "水剋火 (相剋: 破壊)";
    isFavorable = false;
  }
  // 土 (Earth)
  else if (myElement.id === "Earth" && timeElement.id === "Fire") {
    relation = "火生土 (相生: 吸収)";
    isFavorable = true;
  } else if (myElement.id === "Earth" && timeElement.id === "Metal") {
    relation = "土生金 (相生: 放出)";
    isFavorable = true;
  } else if (myElement.id === "Earth" && timeElement.id === "Water") {
    relation = "土剋水 (相剋: 衝突)";
    isFavorable = false;
  } else if (myElement.id === "Earth" && timeElement.id === "Wood") {
    relation = "木剋土 (相剋: 破壊)";
    isFavorable = false;
  }
  // 金 (Metal)
  else if (myElement.id === "Metal" && timeElement.id === "Earth") {
    relation = "土生金 (相生: 吸収)";
    isFavorable = true;
  } else if (myElement.id === "Metal" && timeElement.id === "Water") {
    relation = "金生水 (相生: 放出)";
    isFavorable = true;
  } else if (myElement.id === "Metal" && timeElement.id === "Wood") {
    relation = "金剋木 (相剋: 衝突)";
    isFavorable = false;
  } else if (myElement.id === "Metal" && timeElement.id === "Fire") {
    relation = "火剋金 (相剋: 破壊)";
    isFavorable = false;
  }
  // 水 (Water)
  else if (myElement.id === "Water" && timeElement.id === "Metal") {
    relation = "金生水 (相生: 吸収)";
    isFavorable = true;
  } else if (myElement.id === "Water" && timeElement.id === "Wood") {
    relation = "水生木 (相生: 放出)";
    isFavorable = true;
  } else if (myElement.id === "Water" && timeElement.id === "Fire") {
    relation = "水剋火 (相剋: 衝突)";
    isFavorable = false;
  } else if (myElement.id === "Water" && timeElement.id === "Earth") {
    relation = "土剋水 (相剋: 破壊)";
    isFavorable = false;
  }

  return {
    isOptimal: isGoodGate && isFavorable,
    isFavorable,
    isGoodGate,
    myElement,
    timeElement,
    relation,
  };
}

/** 八門の意味。画面に出す短い説明。 */
export function getGateDescription(gateName: string): string {
  if (gateName.includes("生")) return "新しい開始・生命力 (Start/Vitality)";
  if (gateName.includes("休")) return "休息・回復・平和 (Rest/Peace)";
  if (gateName.includes("開")) return "開拓・ビジネス・前進 (Open/Business)";
  if (gateName.includes("傷")) return "挑戦・トラブル注意 (Challenge/Risk)";
  if (gateName.includes("杜")) return "隠蔽・停滞・守り (Block/Defend)";
  if (gateName.includes("景")) return "文書・契約・表面化 (Document/Reveal)";
  if (gateName.includes("死")) return "停止・終わり・危険 (Stop/Danger)";
  if (gateName.includes("驚")) return "驚き・議論・警戒 (Surprise/Argue)";
  return "通常 (Normal)";
}
