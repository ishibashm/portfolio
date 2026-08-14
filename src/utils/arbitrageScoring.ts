/**
 * 候補の切り出し方（抽出戦略）。
 *
 * DB 全件を評価するわけにはいかないので、SQL 側で上位 N 件（既定 500）に
 * 切る。どの角度で切るかをここで選ぶ。絞り込みフィルターとは別物で、
 * 「500 件の窓に何を入れるか」の設定。
 *
 * このファイルには以前、11 の評価軸・重みプリセット・総合スコアの合成が
 * あった（#304〜#308 で廃止）。残ったのは抽出戦略だけだが、ファイル名は
 * 変えていない。import している側（route / page / query とテスト）を
 * 巻き添えにしないため。
 */

export const CANDIDATE_STRATEGIES = [
  {
    id: "value",
    label: "割安順",
    description: "㎡単価の安い順に候補を集める。裁定機会の探索に最も直結する。",
  },
  {
    id: "balanced",
    label: "総合バランス順",
    description:
      "㎡単価・築年数・駅徒歩・面積の順位を合成して候補を集める。特定の軸に偏らない。",
  },
  {
    id: "newest",
    label: "築浅順",
    description: "築年数の浅い順。建物条件を重く見るときの候補集めに向く。",
  },
  {
    id: "spacious",
    label: "広い順",
    description: "専有面積の広い順。広さを重く見るときの候補集めに向く。",
  },
  {
    id: "station",
    label: "駅近順",
    description: "駅徒歩の短い順。通勤利便を重く見るときの候補集めに向く。",
  },
  {
    id: "fresh",
    label: "新着順",
    description: "掲載開始の新しい順。まだ動かれていない出物を拾う。",
  },
] as const;

export type CandidateStrategy = (typeof CANDIDATE_STRATEGIES)[number]["id"];

export const DEFAULT_CANDIDATE_STRATEGY: CandidateStrategy = "value";

export function isCandidateStrategy(value: string): value is CandidateStrategy {
  return CANDIDATE_STRATEGIES.some((s) => s.id === value);
}
