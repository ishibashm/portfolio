import type { Metadata } from "next";
import Link from "next/link";
import { AiExportBox } from "@/components/AiExportBox";
import { RelocationFormEnhancer } from "@/components/houi/RelocationFormEnhancer";
import { AREAS } from "@/lib/areaContent";
import { buildRelocationCalendarAiExport } from "@/lib/aiExportPages";
import { STAR_NAMES } from "@/lib/kigakuContent";
import { buildBase } from "@/lib/mcpDirections";
import { resolveRelocationOrigin } from "@/lib/relocationCalendarOrigin";
import { findRelocationWindows } from "@/lib/relocationWindows";
import { coreRouteLabel } from "@/lib/siteStructure";
import { pageOpenGraph } from "@/lib/siteUrl";

const PATH = "/houi/relocation-calendar";
const FORM_ID = "relocation-calendar-form";
const PLACE_LIST_ID = "relocation-calendar-places";
/** 入力候補。コード順（＝おおむね北から）に並べる。 */
const PLACE_OPTIONS = [...AREAS].sort((a, b) => a.code.localeCompare(b.code));
const TITLE = coreRouteLabel(PATH)!;
const DESCRIPTION =
  "年盤・月盤から引越しできる期間と方位の強さ、3盤そろう日を一覧で確認できます。";
type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export const dynamic = "force-dynamic";
export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const query = await searchParams;
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/houi/relocation-calendar" },
    openGraph: pageOpenGraph(PATH, TITLE, DESCRIPTION),
    robots: {
      index: Object.keys(query).length === 0,
      follow: Object.keys(query).length === 0,
    },
  };
}

export default async function RelocationCalendarPage({ searchParams }: Props) {
  const query = await searchParams;
  const read = (key: string) =>
    typeof query[key] === "string" ? (query[key] as string) : undefined;
  // Personal query values are used only for this response, never echoed into form,
  // metadata, JSON-LD, links, logs, or persistent storage. 市区町村は、どこで
  // 計算したかを確かめられるよう正式名だけを表示する（座標は出さない）。
  const hasQuery = Object.keys(query).length > 0;
  const origin = hasQuery
    ? resolveRelocationOrigin({
        code: read("code"),
        place: read("place"),
        lon: read("lon"),
      })
    : null;
  const originLon = origin?.kind === "ok" ? origin.lon : undefined;
  const result =
    hasQuery && origin?.kind === "ok"
      ? findRelocationWindows({
          birthDate: read("birthDate"),
          birthTime: read("birthTime") || undefined,
          lon: origin.lon,
          from: read("from") || undefined,
          days: read("days") ? Number(read("days")) : undefined,
        })
      : null;
  const built =
    result?.ok && originLon !== undefined
      ? buildBase({
          birthDate: read("birthDate"),
          birthTime: read("birthTime") || undefined,
          lon: originLon,
        })
      : null;
  const resolvedPlace = origin?.kind === "ok" ? origin.place?.name : undefined;
  const honmeiStar = built?.ok ? built.honmei.classical : undefined;
  const markdown = result?.ok
    ? buildRelocationCalendarAiExport({
        payload: result.payload,
        generatedAt: new Date(),
        honmeiStar,
        honmeiStarName: honmeiStar ? STAR_NAMES[honmeiStar] : undefined,
        voidZodiacs: built?.ok ? built.voidZodiacs : undefined,
      })
    : null;

  return (
    <main className="wg-page min-h-screen px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <header>
          <nav aria-label="パンくず">
            <Link href="/">ホーム</Link> /{" "}
            <Link href="/houi">方位と引越し</Link> / {TITLE}
          </nav>
          <h1 className="mt-3 text-2xl font-bold">{TITLE}</h1>
          <p className="mt-2">
            {DESCRIPTION} 同じ方位と強さが続く日を一つの期間にまとめます。
          </p>
        </header>
        <form
          id={FORM_ID}
          method="get"
          action={PATH}
          className="wg-card flex flex-wrap gap-4 p-6"
        >
          <label>
            生年月日（必須）
            <input
              className="block border p-2"
              name="birthDate"
              type="date"
              required
            />
          </label>
          <label>
            出生時刻（任意・JST）
            <input className="block border p-2" name="birthTime" type="time" />
          </label>
          <label>
            今住んでいる市区町村
            <input
              className="block border p-2"
              name="place"
              type="text"
              list={PLACE_LIST_ID}
              autoComplete="off"
              maxLength={80}
              placeholder="例：名古屋市中川区"
            />
          </label>
          <datalist id={PLACE_LIST_ID}>
            {PLACE_OPTIONS.map((a) => (
              <option
                key={a.code}
                value={a.full}
                data-lat={a.lat.toFixed(2)}
                data-lon={a.lon.toFixed(2)}
              />
            ))}
          </datalist>
          <label>
            開始日（省略時は今日JST）
            <input className="block border p-2" name="from" type="date" />
          </label>
          <label>
            日数（30〜730・既定600）
            <input
              className="block border p-2"
              name="days"
              type="number"
              min="30"
              max="730"
              defaultValue="600"
            />
          </label>
          <p className="w-full text-sm">
            市区町村名は「中川区」「なごや」のように一部や読みでも探せます。同じ名前がいくつかあるときは候補を出します。入力内容はURLに含まれるため、結果URLの共有にご注意ください。
          </p>
          <details className="w-full text-sm">
            <summary>経度で詳しく指定（任意）</summary>
            <label className="mt-2 block">
              出発地の経度（122〜154。市区町村名が空のときに使います）
              <input
                className="block border p-2"
                name="lon"
                type="number"
                min="122"
                max="154"
                step="any"
              />
            </label>
            <p className="mt-1">
              経度の例：東京139.69 / 名古屋136.91 / 大阪135.50
            </p>
          </details>
          <RelocationFormEnhancer
            formId={FORM_ID}
            listId={PLACE_LIST_ID}
            resolvedPlace={resolvedPlace}
          />
          <button className="wg-btn-primary" type="submit">
            一覧を表示
          </button>
        </form>
        <section className="wg-card p-6">
          <h2 className="text-xl font-bold">強さの見方</h2>
          <p>
            S＝年盤・月盤どちらも吉、A＝吉2盤、B＝片方吉、C＝平、D＝軽い凶。X（五大凶殺）は使える方位から除外します。年盤・月盤では吉2盤はSになるためAは現れません。
          </p>
          <p>
            全方位凶は使える方位がない日です。天中殺は年・月だけを見て、既定では吉凶を弱めるだけで禁止しません。時刻の天中殺は使いません。六曜などは目安で、方位の段階には使いません。
          </p>
          <p>
            伝統的な暦の見方であり、出来事を予測・保証するものではありません。生活上の条件と合わせて判断してください。
          </p>
        </section>
        {origin?.kind === "error" && <p role="alert">{origin.message}</p>}
        {origin?.kind === "ambiguous" && (
          <section className="wg-card p-6" aria-labelledby="place-candidates">
            <h2 id="place-candidates" className="text-xl font-bold">
              市区町村を選んでください
            </h2>
            <p role="alert">
              「{origin.query}
              」に当てはまる市区町村がいくつかあります。今住んでいるところを選ぶと、その場所で計算し直します。
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {origin.candidates.map((c) => (
                <li key={c.code}>
                  <button
                    type="submit"
                    form={FORM_ID}
                    name="code"
                    value={c.code}
                    className="rounded-full border px-3 py-1.5 text-sm font-semibold"
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm">
              生年月日の欄が空のときは、入れ直してから選んでください。
            </p>
          </section>
        )}
        {result && !result.ok && <p role="alert">{result.error}</p>}
        {result?.ok && resolvedPlace && (
          <p>出発地：{resolvedPlace}で計算しました。</p>
        )}
        {result?.ok && (
          <>
            <section className="wg-card p-6">
              <h2 className="text-xl font-bold">期間の一覧</h2>
              <p>
                {result.payload.summary.totalDays}日 /{" "}
                {result.payload.summary.windowsCount}期間 / 全方位凶{" "}
                {result.payload.summary.allDirectionsBadDays}日 / 天中殺{" "}
                {result.payload.summary.tenchusatsuDays}日
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    引越しの期間・方位・天中殺
                  </caption>
                  <thead>
                    <tr>
                      {[
                        "期間",
                        "日数",
                        "使える方位と強さ",
                        "天中殺（年/月）",
                      ].map((h) => (
                        <th key={h} scope="col" className="p-2">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.payload.windows.map((w) => (
                      <tr
                        key={w.from}
                        className={
                          w.allDirectionsBad
                            ? "border-b bg-rose-100"
                            : "border-b"
                        }
                      >
                        <th scope="row" className="p-2">
                          {w.from}〜{w.to}
                        </th>
                        <td className="p-2">{w.days}</td>
                        <td className="p-2">
                          {w.allDirectionsBad ? (
                            <strong>全方位凶</strong>
                          ) : (
                            w.directions
                              .map((d) => `${d.label} ${d.tier}`)
                              .join(" / ")
                          )}
                        </td>
                        <td className="p-2">
                          {w.tenchusatsu.inPeriod ? (
                            <>
                              {w.tenchusatsu.scopes
                                .map((s) => (s === "year" ? "年" : "月"))
                                .join("・")}
                              ：{w.tenchusatsu.note}
                            </>
                          ) : (
                            "—"
                          )}
                          {w.tenchusatsu.blocks && <strong> 移転不可</strong>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="wg-card p-6">
              <h2 className="text-xl font-bold">3盤そろう日</h2>
              <p>
                同じ方位で年盤・月盤・日盤すべて吉の日です。全
                {result.payload.tripleDaysTotal}日（最大200日表示）。
              </p>
              {result.payload.tripleDays.length ? (
                <ul>
                  {result.payload.tripleDays.map((d) => (
                    <li key={d.date}>
                      {d.date}：{d.directions.map((v) => v.label).join("・")}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>この期間に該当する日はありません。</p>
              )}
            </section>
            {markdown ? <AiExportBox markdown={markdown} /> : null}
          </>
        )}
      </div>
    </main>
  );
}
