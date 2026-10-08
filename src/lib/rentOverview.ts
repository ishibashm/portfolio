import {
  housingFiguresFor,
  rentDiffPct,
  type HousingSnapshotData,
} from "@/lib/housingSnapshot";
import { TATAMI_SQM } from "@/lib/housingStatsDirections";

export interface RentPlace {
  code: string;
  city: string;
}
export function rentRows(
  snapshot: HousingSnapshotData,
  places: readonly RentPlace[],
) {
  return [...new Map(places.map((p) => [p.code, p])).values()].map((p) => ({
    ...p,
    figures: housingFiguresFor(snapshot, p.code),
  }));
}
export type RentRow = ReturnType<typeof rentRows>[number];

/** 母集団は頁のある市区町村。未公表を除き、同額は同順位。 */
export function rankRents(
  snapshot: HousingSnapshotData,
  places: readonly RentPlace[],
  order: "asc" | "desc" = "asc",
) {
  const rows = rentRows(snapshot, places)
    .filter(
      (
        r,
      ): r is RentRow & {
        figures: NonNullable<RentRow["figures"]> & { rentPerSqm: number };
      } => r.figures?.rentPerSqm != null,
    )
    .sort(
      (a, b) =>
        (order === "asc" ? 1 : -1) *
          (a.figures.rentPerSqm - b.figures.rentPerSqm) ||
        a.code.localeCompare(b.code),
    );
  return rows.map((r, i) => ({
    ...r,
    rank:
      rows.findIndex(
        (other) => other.figures.rentPerSqm === rows[i].figures.rentPerSqm,
      ) + 1,
  }));
}

export function nearbyRentPlaces<T extends RentPlace & { distanceKm: number }>(
  places: readonly T[],
  prefCode: string,
) {
  return [
    ...new Map(
      places.filter((p) => p.code.startsWith(prefCode)).map((p) => [p.code, p]),
    ).values(),
  ]
    .sort((a, b) => a.distanceKm - b.distanceKm || a.code.localeCompare(b.code))
    .slice(0, 8);
}

export function rentComparison(
  origin: RentRow["figures"],
  other: RentRow["figures"],
) {
  const diff = rentDiffPct(origin, other);
  return diff === null
    ? "比較できません"
    : diff === 0
      ? "差は約0%"
      : `約${Math.abs(diff)}%${diff > 0 ? "高い" : "低い"}`;
}

export const RENT_AVERAGE_NOTE =
  "保存データには県全体・全国の家賃や空き家率の公表値がないため、県平均・全国平均との差は表示していません。市区町村の単純平均や県庁所在市の値を県平均の代わりにはしていません。";
export const RENT_METHOD_NOTE = `1㎡あたり家賃＝1畳あたり家賃÷${TATAMI_SQM}（円単位に丸め）。1戸あたりの月額の目安＝1畳あたり家賃×借家1戸あたり畳数（100円単位に丸め）。平均どうしの積であり、実際の平均家賃や募集中の物件の家賃ではありません。畳数は居住室の広さ、延べ面積は住宅全体の広さなので、延べ面積にこの単価を掛ける計算はしていません。空き家率＝空き家数÷総住宅数で、賃貸住宅だけの空室率ではありません。`;
const yen = (n: number) => n.toLocaleString("ja-JP");
export function rentSummary(
  snapshot: HousingSnapshotData,
  code: string,
  name: string,
) {
  const raw = snapshot.areas[code];
  const f = housingFiguresFor(snapshot, code);
  if (!raw || !f)
    return `${name}は、保存している住宅・土地統計調査の市区町村別集計に行がありません。家賃を推定して補ってはいません。`;
  const parts = [
    `${snapshot.year}年の住宅・土地統計調査による${name}の借家は、${raw.rentPerTatamiYen === null || f.rentPerSqm === null ? "家賃が公表されていません" : `1畳あたり${yen(raw.rentPerTatamiYen)}円/月、1㎡あたり${yen(f.rentPerSqm)}円/月です`}。`,
  ];
  if (f.floorAreaPerRental !== null)
    parts.push(`借家1戸あたりの延べ面積は${f.floorAreaPerRental}㎡です。`);
  if (raw.tatamiPerRental !== null)
    parts.push(`借家1戸あたりの畳数は${raw.tatamiPerRental}畳です。`);
  if (f.monthlyRentEstimate !== null)
    parts.push(
      `1戸あたりの家賃の目安は${yen(f.monthlyRentEstimate)}円/月（${yen(raw.rentPerTatamiYen!)}円×${raw.tatamiPerRental}畳、100円単位に丸め）です。`,
    );
  if (f.vacancyRate !== null)
    parts.push(`空き家率は${(f.vacancyRate * 100).toFixed(1)}%です。`);
  if (f.totalDwellings !== null)
    parts.push(`総住宅数は${yen(f.totalDwellings)}戸です。`);
  return parts.join("");
}

export function rentFaqs(
  snapshot: HousingSnapshotData,
  name: string,
  places: readonly RentPlace[],
  code?: string,
) {
  const ranked = rankRents(snapshot, places);
  const cheapest = ranked.filter((r) => r.rank === 1);
  const answer = cheapest.length
    ? `この県で頁があり、家賃の公表値がある${ranked.length}市区町村では、${cheapest.map((r) => r.city).join("・")}が1㎡あたり${yen(cheapest[0].figures.rentPerSqm)}円/月で最も低い値です。同額は同順位です。県内の全自治体や個別物件を網羅した順位ではありません。`
    : "この県で頁のある市区町村には家賃の公表値がなく、順位を出せません。";
  return [
    {
      question: `${name}の家賃相場は？`,
      answer: code
        ? rentSummary(snapshot, code, name)
        : `${snapshot.year}年の住宅・土地統計調査を使い、市区町村ごとの借家の家賃を比べています。${RENT_AVERAGE_NOTE}`,
    },
    {
      question: "県内で家賃が安いのは？",
      answer: `${snapshot.year}年の比較です。${answer}`,
    },
    {
      question: "間取り別の家賃や、いま募集している部屋の価格は分かりますか？",
      answer:
        "この統計の保存データには間取り別の家賃や現在募集中の物件価格はありません。1K・1LDKなどの額には換算していません。月額の目安の計算方法は次のとおりです。" +
        RENT_METHOD_NOTE,
    },
  ];
}
