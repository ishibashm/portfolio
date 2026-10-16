import { parseAnswerBlocks } from "@/lib/answerBlocks";
import { directionLabelName } from "@/lib/directionLabels";
import { TIER_FILL } from "@/utils/tierDisplay";
import { AgentAnswer } from "./AgentAnswer";

const positions = {
  NW: [1, 1],
  N: [1, 2],
  NE: [1, 3],
  W: [2, 1],
  E: [2, 3],
  SW: [3, 1],
  S: [3, 2],
  SE: [3, 3],
};
export function AnswerBlocks({ blocks }: { blocks: unknown }) {
  return (
    <div className="min-w-0 space-y-4 break-words">
      {parseAnswerBlocks(blocks).map((b, i) => (
        <section
          key={i}
          className="min-w-0 rounded-2xl border border-stone-200 bg-white p-4 text-sm"
        >
          {b.type === "text" && <AgentAnswer text={b.text} />}
          {b.type === "callout" && (
            <aside className="border-l-4 border-amber-400 pl-3">{b.text}</aside>
          )}
          {b.type === "compass" && (
            <>
              <h3 className="mb-3 font-semibold">方位 {b.date}</h3>
              <div className="grid grid-cols-3 gap-2" aria-label="八方位">
                {b.directions.map((d) => (
                  <div
                    key={d.direction}
                    style={{
                      gridRow: positions[d.direction][0],
                      gridColumn: positions[d.direction][1],
                      borderColor: d.tier ? TIER_FILL[d.tier] : "#a8a29e",
                    }}
                    className="min-w-0 rounded-lg border-t-4 bg-stone-50 p-2 text-center"
                  >
                    <strong>{d.label}</strong>
                    <p className="text-xs">{directionLabelName(d.status)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
          {b.type === "towns" && (
            <>
              <h3 className="mb-3 font-semibold">街の候補</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {b.towns.map((t, j) => (
                  <article
                    key={j}
                    className="min-w-0 rounded-xl bg-stone-50 p-3"
                  >
                    <p>{t.pref}</p>
                    <a className="font-semibold underline" href={t.url}>
                      {t.name}
                    </a>
                    {t.rentPerSqm !== undefined && (
                      <p>家賃 {t.rentPerSqm.toLocaleString("ja-JP")} 円/㎡</p>
                    )}
                    {t.prefectureRank !== undefined && (
                      <p>県内 {t.prefectureRank}位</p>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
          {b.type === "rentTable" && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <caption className="mb-3 text-left font-semibold">
                  家賃比較
                </caption>
                <thead>
                  <tr>
                    <th className="p-2">街</th>
                    <th className="p-2">家賃（円/㎡）</th>
                  </tr>
                </thead>
                <tbody>
                  {b.towns.map((t, j) => (
                    <tr key={j}>
                      <td className="p-2">
                        <a href={t.url} className="underline">
                          {t.name}
                        </a>
                      </td>
                      <td className="p-2">
                        {t.rentPerSqm?.toLocaleString("ja-JP") ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {b.type === "days" && (
            <>
              <h3 className="mb-3 font-semibold">吉日カレンダー</h3>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {b.days.map((d, j) => (
                  <li key={j} className="rounded-lg bg-emerald-50 p-2">
                    <time dateTime={d.date}>{d.date}</time>
                    <p>{d.label}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
          {b.type === "articles" && (
            <>
              <h3 className="mb-3 font-semibold">関連記事</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {b.articles.map((a, j) => (
                  <article
                    key={j}
                    className="min-w-0 rounded-lg bg-stone-50 p-3"
                  >
                    <a href={a.url} className="font-semibold underline">
                      {a.title}
                    </a>
                    <p className="mt-2">{a.description}</p>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      ))}
    </div>
  );
}
