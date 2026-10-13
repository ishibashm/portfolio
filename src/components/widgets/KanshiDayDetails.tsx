import { KANSHI_BASIS, kanshiForBirth, parseKanshiBirth } from "@/lib/kanshi";

/** カレンダー上で選んだ暦日を受け、実行環境のTZによらずJST正午で表示する。 */
export function KanshiDayDetails({ date }: { date: string }) {
  if (!parseKanshiBirth(date)) return null;
  const result = kanshiForBirth(date);
  const terms = result.solarTerms.filter((term) =>
    term.atJst.startsWith(date.slice(0, 7)),
  );
  return (
    <section
      aria-label="選択日の干支と節気"
      className="mb-6 rounded-xl border border-stone-200 p-3 text-xs text-stone-700"
    >
      <h4 className="font-bold">六十干支（JST正午）</h4>
      <p className="mt-2">
        年：{result.kanshi.year} ／ 月：{result.kanshi.month} ／ 日：
        {result.kanshi.day}
      </p>
      {result.boundaryAlternatives && (
        <p className="mt-2 text-amber-900">
          節入り前は年{result.boundaryAlternatives.before.year}・月
          {result.boundaryAlternatives.before.month}、以後は年
          {result.boundaryAlternatives.after.year}・月
          {result.boundaryAlternatives.after.month}です。
        </p>
      )}
      <h4 className="mt-3 font-bold">今月の二十四節気・節入り時刻（計算値）</h4>
      <ul className="mt-2 space-y-1">
        {terms.map((term) => (
          <li key={term.name}>
            {term.name}：
            {term.atJst.replace("T", " ").replace("+09:00", " JST")}
            {term.changesMonth ? "（月の境界）" : "（中気）"}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-stone-500">{KANSHI_BASIS}</p>
    </section>
  );
}
