import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { currentYearInJapan, STAR_NAMES } from "@/lib/kigakuContent";
import {
  directionLabelName,
  isKnownDirectionStatus,
} from "@/lib/directionLabels";
import { pageOpenGraph } from "@/lib/siteUrl";
import {
  GUIDE_KINDS,
  GUIDE_KIND_INFO,
  GUIDE_SETSUBUN_LABELS,
  GUIDE_TOPIC_KEYS,
  GUIDE_TOPICS,
  parseGuideQuery,
  type GuideQueryStep2,
  type GuideQueryStep3,
} from "@/lib/guide/guideForm";
import { loadGuideAnswer, type GuideAnswerData } from "@/lib/guide/guidePage";

export const dynamic = "force-dynamic";

const PAGE_TITLE = "案内役に聞く｜方位と日取りをサイトの道具で確かめる";
const PAGE_DESCRIPTION =
  "質問を選ぶと、案内役がこのサイトの計算道具（MCP）を呼び、その結果だけで答えます。呼んだ道具と結果も下に出します。";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/*
  入口も含めて検索に載せない（/ask と同じ扱い）。答えの段は入力ごとに
  道具を呼ぶので、巡回で上限を減らさないよう、入口からも辿らせない。
*/
export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "/annai" },
  robots: { index: false, follow: false },
  openGraph: pageOpenGraph("/annai", PAGE_TITLE, PAGE_DESCRIPTION),
};

/** 道具の状態コード（NOISE_ANKEN など）を画面と同じ呼び名にする。 */
function statusText(status: string): string {
  return isKnownDirectionStatus(status) ? directionLabelName(status) : status;
}

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps: { step: 1 | 2 | 3; label: string }[] = [
    { step: 1, label: "1 選ぶ" },
    { step: 2, label: "2 入れる" },
    { step: 3, label: "3 答え" },
  ];
  return (
    <ol
      aria-label="進行の段階"
      className="mt-5 flex flex-wrap items-center gap-2 text-sm"
    >
      {steps.map((item, idx) => {
        const active = item.step === current;
        return (
          <li key={item.step} className="flex items-center gap-2">
            {idx > 0 && (
              <span aria-hidden="true" className="text-slate-400">
                →
              </span>
            )}
            <span
              aria-current={active ? "step" : undefined}
              className={
                active
                  ? "rounded-full bg-slate-900 px-3.5 py-1 font-bold text-white"
                  : "rounded-full border border-slate-300 bg-white/80 px-3.5 py-1 text-slate-600"
              }
            >
              {item.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Step1View() {
  return (
    <section aria-labelledby="step1-heading" className="mt-8 space-y-4">
      <h2 id="step1-heading" className="text-lg font-bold font-serif">
        知りたいことを選んでください
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {GUIDE_KINDS.map((kind) => {
          const info = GUIDE_KIND_INFO[kind];
          return (
            <Link
              key={kind}
              href={`/annai?kind=${kind}`}
              className="block rounded-2xl border border-slate-300 bg-white p-6 shadow-sm transition-colors hover:border-rose-500"
            >
              <span className="block text-lg font-bold font-serif text-slate-900">
                {info.title}
              </span>
              <span className="mt-2 block text-sm leading-relaxed text-slate-600">
                {info.description}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Step2View({ query }: { query: GuideQueryStep2 }) {
  const currentYear = currentYearInJapan();
  const years: number[] = [];
  for (let y = currentYear; y >= 1900; y--) {
    years.push(y);
  }
  const info = GUIDE_KIND_INFO[query.kind];

  return (
    <section
      aria-labelledby="step2-heading"
      className="mt-8 rounded-2xl border border-slate-300 bg-white p-6 shadow-sm space-y-6"
    >
      <div>
        <h2 id="step2-heading" className="text-lg font-bold font-serif">
          {info.title}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{info.description}</p>
      </div>

      <form method="get" action="/annai" className="space-y-6">
        <input type="hidden" name="kind" value={query.kind} />

        {(query.kind === "honmei" || query.kind === "today") && (
          <>
            <div>
              <label
                htmlFor="guide-year"
                className="block text-sm font-bold text-slate-800"
              >
                生まれ年（西暦）
              </label>
              <select
                id="guide-year"
                name="y"
                defaultValue={query.y ?? 1990}
                className="mt-2 w-full max-w-xs rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}年
                  </option>
                ))}
              </select>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-bold text-slate-800">
                生まれた日（立春前後）
              </legend>
              {(["after", "before", "unknown"] as const).map((val) => (
                <label
                  key={val}
                  className="flex items-center gap-2 text-sm text-slate-800"
                >
                  <input
                    type="radio"
                    name="s"
                    value={val}
                    defaultChecked={(query.s ?? "after") === val}
                  />
                  <span>{GUIDE_SETSUBUN_LABELS[val]}</span>
                </label>
              ))}
            </fieldset>
          </>
        )}

        {query.kind === "move" && (
          <>
            <div>
              <label
                htmlFor="guide-birthdate"
                className="block text-sm font-bold text-slate-800"
              >
                生年月日
              </label>
              <input
                id="guide-birthdate"
                type="date"
                name="b"
                required
                min="1900-01-01"
                max="2100-12-01"
                defaultValue={query.b ?? "1990-05-15"}
                className="mt-2 w-full max-w-xs rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="guide-municipality"
                className="block text-sm font-bold text-slate-800"
              >
                出発地の市区町村
              </label>
              <input
                id="guide-municipality"
                type="text"
                name="m"
                maxLength={40}
                required
                defaultValue={query.m ?? ""}
                placeholder="例: 新宿区、横浜市中区、札幌市北区"
                className="mt-2 w-full max-w-md rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              />
              <p className="mt-1.5 text-xs text-slate-600">
                候補の例:
                東京都新宿区、神奈川県横浜市中区、大阪府大阪市北区、北海道札幌市北区、福岡県福岡市博多区、長崎県長崎市
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-bold text-slate-800">
                日取りを探す期間
              </legend>
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="radio"
                  name="p"
                  value="30"
                  defaultChecked={query.p === 30}
                />
                <span>30日間（標準）</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="radio"
                  name="p"
                  value="90"
                  defaultChecked={query.p === 90}
                />
                <span>90日間</span>
              </label>
            </fieldset>
          </>
        )}

        {query.kind === "read" && (
          <fieldset className="space-y-2.5">
            <legend className="text-sm font-bold text-slate-800">
              調べたい話題
            </legend>
            {GUIDE_TOPIC_KEYS.map((key, index) => (
              <label
                key={key}
                className="flex items-center gap-2 text-sm text-slate-800"
              >
                <input
                  type="radio"
                  name="t"
                  value={key}
                  defaultChecked={query.t ? query.t === key : index === 0}
                />
                <span>{GUIDE_TOPICS[key].label}</span>
              </label>
            ))}
          </fieldset>
        )}

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
          >
            サイトの道具で調べる
          </button>
          <Link
            href="/annai"
            className="text-sm text-slate-600 underline hover:text-slate-900"
          >
            戻る
          </Link>
        </div>
      </form>
    </section>
  );
}

function QuestionSummaryBox({ query }: { query: GuideQueryStep3 }) {
  const info = GUIDE_KIND_INFO[query.kind];
  return (
    <section
      aria-labelledby="question-summary-heading"
      className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm"
    >
      <h2
        id="question-summary-heading"
        className="text-sm font-bold text-slate-700"
      >
        ① 質問の要約
      </h2>
      <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-slate-500">質問の種類</dt>
          <dd className="font-semibold text-slate-900">{info.title}</dd>
        </div>
        {(query.kind === "honmei" || query.kind === "today") && (
          <>
            <div>
              <dt className="text-xs text-slate-500">生まれ年</dt>
              <dd className="font-semibold text-slate-900">{query.y}年</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">立春前後</dt>
              <dd className="font-semibold text-slate-900">
                {GUIDE_SETSUBUN_LABELS[query.s]}
              </dd>
            </div>
          </>
        )}
        {query.kind === "move" && (
          <>
            <div>
              <dt className="text-xs text-slate-500">生年月日</dt>
              <dd className="font-semibold text-slate-900">{query.b}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">出発地の市区町村</dt>
              <dd className="font-semibold text-slate-900">
                {query.m}
                {query.c ? `（コード: ${query.c}）` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">走査期間</dt>
              <dd className="font-semibold text-slate-900">{query.p}日間</dd>
            </div>
          </>
        )}
        {query.kind === "read" && (
          <div>
            <dt className="text-xs text-slate-500">話題</dt>
            <dd className="font-semibold text-slate-900">
              {GUIDE_TOPICS[query.t].label}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function Step3View({ answer }: { answer: GuideAnswerData }) {
  const { query, facts, trace } = answer;

  return (
    <div className="mt-8 space-y-6">
      {/* ① 質問の要約 */}
      <QuestionSummaryBox query={query} />

      {/* ② AIの状態の注記 */}
      <section
        aria-labelledby="ai-status-heading"
        className="rounded-2xl border border-slate-300 bg-white/90 p-4 text-sm text-slate-700"
      >
        <h2 id="ai-status-heading" className="text-xs font-bold text-slate-500">
          ② AI要約の状態
        </h2>
        <p className="mt-1">{answer.aiNote}</p>
      </section>

      {/* 停止スイッチまたは上限超過のとき */}
      {(answer.status === "stopped" || answer.status === "rate_limited") && (
        <section
          role="status"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-sm text-slate-900 space-y-3"
        >
          <h2 className="text-base font-bold font-serif">
            {answer.status === "stopped"
              ? "停止中"
              : `混み合っています（約${answer.retryAfterSeconds ?? 60}秒後に）`}
          </h2>
          <p>{answer.message}</p>
          <p>
            <Link href="/annai" className="font-bold text-rose-700 underline">
              質問の選択に戻る
            </Link>
          </p>
        </section>
      )}

      {/* 市区町村の候補が複数の場合は候補リンク一覧を出して止める */}
      {answer.status === "candidates" &&
        facts.municipalityCandidates &&
        facts.municipalityCandidates.length > 1 &&
        query.kind === "move" && (
          <section
            aria-labelledby="candidates-heading"
            className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm space-y-4"
          >
            <h2
              id="candidates-heading"
              className="text-base font-bold font-serif"
            >
              出発地の市区町村を1つ選んでください
            </h2>
            <p className="text-sm text-slate-600">
              「{query.m}」に一致する市区町村が
              {facts.municipalityCandidates.length}
              件見つかりました。どれを出発地にするか選んでください。
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {facts.municipalityCandidates.map((cand) => {
                const params = new URLSearchParams({
                  kind: "move",
                  b: query.b,
                  m: cand.name,
                  c: cand.code,
                  p: String(query.p),
                });
                return (
                  <li key={cand.code}>
                    <Link
                      href={`/annai?${params.toString()}`}
                      className="block rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 hover:border-rose-500 hover:bg-white"
                    >
                      {cand.name}（コード: {cand.code}）
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

      {/* 通常または失敗時の ③〜⑥ */}
      {answer.status !== "stopped" && answer.status !== "rate_limited" && (
        <>
          {/* ③ 結論（照合を通った文だけ） */}
          <section
            aria-labelledby="conclusion-heading"
            className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm space-y-3"
          >
            <h2
              id="conclusion-heading"
              className="text-base font-bold font-serif"
            >
              ③ 結論（道具の結果と照合済みの文）
            </h2>
            {answer.message && (
              <p className="text-sm font-semibold text-rose-700">
                {answer.message}
              </p>
            )}
            {facts.candidateNote && (
              <p className="text-xs text-slate-600">{facts.candidateNote}</p>
            )}
            {answer.sentences.length > 0 ? (
              <div className="space-y-2 text-sm leading-relaxed text-slate-800">
                {answer.sentences.map((sentence, index) => (
                  <p key={index}>{sentence}</p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                照合を通った要約文はありません。下の表と道具の記録をご確認ください。
              </p>
            )}
          </section>

          {/* ④ 表（値は facts から） */}
          {answer.status !== "candidates" && (
            <section
              aria-labelledby="facts-table-heading"
              className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm space-y-6"
            >
              <h2
                id="facts-table-heading"
                className="text-base font-bold font-serif"
              >
                ④ 道具から得た結果の表
              </h2>

              {/* 本命星 */}
              {(facts.honmeiStar !== undefined ||
                facts.honmeiCandidates !== undefined) && (
                <div>
                  <h3 className="text-sm font-bold text-slate-800">本命星</h3>
                  <table className="mt-2 w-full max-w-md border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-300">
                        <th scope="col" className="py-2 pr-4">
                          区分
                        </th>
                        <th scope="col" className="py-2 pr-4">
                          九星番号
                        </th>
                        <th scope="col" className="py-2">
                          名称
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {facts.honmeiStar !== undefined &&
                        !facts.honmeiCandidates && (
                          <tr className="border-b border-slate-200">
                            <td className="py-2 pr-4">本命星</td>
                            <td className="py-2 pr-4 font-bold">
                              {facts.honmeiStar}
                            </td>
                            <td className="py-2">
                              {STAR_NAMES[facts.honmeiStar] ?? ""}
                            </td>
                          </tr>
                        )}
                      {facts.honmeiCandidates && (
                        <>
                          <tr className="border-b border-slate-200">
                            <td className="py-2 pr-4">
                              立春前（1月1日〜2月3日頃）
                            </td>
                            <td className="py-2 pr-4 font-bold">
                              {facts.honmeiCandidates.beforeSetsubun}
                            </td>
                            <td className="py-2">
                              {STAR_NAMES[
                                facts.honmeiCandidates.beforeSetsubun
                              ] ?? ""}
                            </td>
                          </tr>
                          <tr className="border-b border-slate-200">
                            <td className="py-2 pr-4">
                              立春後（2月4日頃以降）
                            </td>
                            <td className="py-2 pr-4 font-bold">
                              {facts.honmeiCandidates.afterSetsubun}
                            </td>
                            <td className="py-2">
                              {STAR_NAMES[
                                facts.honmeiCandidates.afterSetsubun
                              ] ?? ""}
                            </td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 方位ごとの段階と状態 */}
              {facts.directions.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    方位ごとの段階・状態
                  </h3>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-300">
                          <th scope="col" className="py-2 pr-4">
                            方位
                          </th>
                          <th scope="col" className="py-2 pr-4">
                            段階
                          </th>
                          <th scope="col" className="py-2">
                            状態
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {facts.directions.map((dir, i) => (
                          <tr
                            key={`${dir.direction}-${i}`}
                            className="border-b border-slate-200"
                          >
                            <td className="py-2 pr-4 font-semibold">
                              {dir.label}
                            </td>
                            <td className="py-2 pr-4">{dir.tier ?? "-"}</td>
                            <td className="py-2">{statusText(dir.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 日取りの候補 */}
              {facts.auspiciousDays.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    日取りの候補
                  </h3>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-300">
                          <th scope="col" className="py-2 pr-4">
                            日付
                          </th>
                          <th scope="col" className="py-2 pr-4">
                            方位
                          </th>
                          <th scope="col" className="py-2 pr-4">
                            段階
                          </th>
                          <th scope="col" className="py-2">
                            状態・六曜
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {facts.auspiciousDays.map((day, i) => (
                          <tr
                            key={`${day.date}-${day.label}-${i}`}
                            className="border-b border-slate-200"
                          >
                            <td className="py-2 pr-4 font-semibold">
                              {day.date}
                            </td>
                            <td className="py-2 pr-4">{day.label}</td>
                            <td className="py-2 pr-4">{day.tier ?? "-"}</td>
                            <td className="py-2">
                              {[
                                day.status ? statusText(day.status) : undefined,
                                day.rokuyo,
                              ]
                                .filter(Boolean)
                                .join(" / ") || "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 近くの街 */}
              {facts.towns.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    近くの街（方位別）
                  </h3>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-300">
                          <th scope="col" className="py-2 pr-4">
                            方位
                          </th>
                          <th scope="col" className="py-2 pr-4">
                            市区町村
                          </th>
                          <th scope="col" className="py-2">
                            コード
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {facts.towns.map((town, i) => (
                          <tr
                            key={`${town.code}-${i}`}
                            className="border-b border-slate-200"
                          >
                            <td className="py-2 pr-4">
                              {town.directionLabel ?? town.direction ?? "-"}
                            </td>
                            <td className="py-2 pr-4 font-semibold">
                              <Link
                                href={`/houi/area/${town.code}`}
                                className="text-rose-700 underline"
                              >
                                {town.name}
                              </Link>
                            </td>
                            <td className="py-2">{town.code}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 記事リンク */}
              {facts.articles.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    関連する記事リンク
                  </h3>
                  <ul className="mt-2 space-y-2 text-sm">
                    {facts.articles.map((article, i) => (
                      <li
                        key={`${article.url}-${i}`}
                        className="rounded-xl border border-slate-200 p-3"
                      >
                        <a
                          href={article.url}
                          className="font-bold text-rose-700 underline"
                        >
                          {article.title}
                        </a>
                        {article.section && (
                          <span className="ml-2 text-xs text-slate-500">
                            （{article.section}）
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {/* ⑤ 照合結果の集計 */}
          <section
            aria-label="照合結果"
            className="rounded-2xl border border-slate-300 bg-white/90 p-4 text-sm text-slate-700"
          >
            <p className="font-semibold">
              照合: 道具の結果と一致した値 {answer.matchedCount}{" "}
              個／出さなかった文 {answer.droppedCount} 文
            </p>
          </section>

          {/* ⑥ 根拠：呼んだ道具 */}
          <details
            open
            className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm"
          >
            <summary className="cursor-pointer text-base font-bold font-serif text-slate-900">
              根拠：呼んだ道具（{trace.length}回）
            </summary>
            <ol className="mt-4 space-y-3 text-sm">
              {trace.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900">
                      #{item.id} {item.tool}
                    </span>
                    <span className="text-xs text-slate-600">
                      {item.durationMs}ms
                    </span>
                    <span
                      className={
                        item.ok
                          ? "rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800"
                          : "rounded bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800"
                      }
                    >
                      {item.ok ? "成功" : "失敗"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-700">
                    引数:{" "}
                    <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">
                      {JSON.stringify(item.args)}
                    </code>
                  </div>
                  <p className="text-xs text-slate-700">{item.summary}</p>
                </li>
              ))}
            </ol>
          </details>
        </>
      )}

      {/* ⑦ 続けて押すボタン（2〜4個） */}
      <nav
        aria-label="次の操作"
        className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm space-y-3"
      >
        <h2 className="text-sm font-bold text-slate-700">⑦ 続けて調べる</h2>
        <div className="flex flex-wrap gap-3">
          {answer.followUps.map((link) => (
            <Link
              key={link.href + link.label}
              href={link.href}
              className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-900 hover:border-rose-500 hover:bg-white"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default async function AnnaiPage(props: PageProps) {
  const sp = (await props.searchParams) ?? {};
  const query = parseGuideQuery(sp);

  let answer: GuideAnswerData | null = null;
  if (query.step === 3) {
    const reqHeaders = await headers();
    answer = await loadGuideAnswer({
      query,
      headers: reqHeaders,
    });
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900">
      <article className="mx-auto max-w-[1700px] px-5 py-12">
        <nav aria-label="パンくず" className="mb-4 text-sm text-slate-600">
          <Link href="/" className="hover:underline">
            ホーム
          </Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">案内役に聞く</span>
        </nav>

        <h1 className="text-2xl font-bold font-serif sm:text-3xl">
          案内役に聞く
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-700">
          質問を選ぶと、案内役がこのサイトの計算道具（MCP）を呼び、その結果だけで答えます。呼んだ道具と結果も下に出します。
        </p>

        <StepIndicator current={query.step} />

        {query.step === 1 && <Step1View />}
        {query.step === 2 && <Step2View query={query} />}
        {query.step === 3 && answer && <Step3View answer={answer} />}

        <p className="mt-10 text-sm text-slate-600">
          吉凶は九星気学の考え方による参考情報です。
        </p>
      </article>
    </main>
  );
}
