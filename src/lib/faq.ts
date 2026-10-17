import data from "@/data/faq.json";
export const faqData = data;
/** 年依存の回答は対象年だけ表示する（JST）。 */
export function availableFaq(now = new Date()) {
  const year = new Intl.DateTimeFormat("en", {
    year: "numeric",
    timeZone: "Asia/Tokyo",
  }).format(now);
  return data.items.filter((item) => !item.asOf || item.asOf === year);
}
export const FAQ_TOOL_QUESTIONS: Record<string, string> = {
  get_honmei_star: "自分の本命星を調べたい",
  judge_directions: "自分の場合の方位を計算したい",
  find_auspicious_days: "自分の引越しの日取りを調べたい",
  get_kanshi: "自分の干支と空亡を調べたい",
  area_directions: "移動先の市区町村を探したい",
};
