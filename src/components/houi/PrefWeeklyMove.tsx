import marketStats from "@/data/marketStats.json";
import type { MarketStats, PrefectureWeeklyMove } from "@/utils/marketStats";

/**
 * 県ページの「この 1 週間の動き」。
 *
 * ## これが地域ニュースの第一歩
 *
 * 県ページの「その地域のニュース」欄は全国フィードを地名で絞るだけ
 * なので、地元発の見出しが無い県はほぼ空になる。いちばん強い地域
 * ニュースは自分のデータで、毎晩の集計（MarketDailySummary）と掲載の
 * 出入りから「その県で今週何が動いたか」を数字で言える。他所に無い
 * 数字なので、雛形の量産（#379）にはならない。
 *
 * ## 出さないときは出さない
 *
 * - 7 日ぶん貯まっていない県（weeklyMoves に無い）… 何も出さない
 * - 掲載が少ない県（n が MIN_N 未満）… 数字が振れるので出さない
 *
 * 「準備中」の札を置かない。空欄を雛形で埋めるのは 2-c の方針に反する。
 *
 * ## 断定しない
 *
 * 数字は当サイトの収集分の集計で、市場全体ではない。上がった・下がった
 * の理由は書かない（分からないことは書かない）。
 */

const stats = marketStats as unknown as MarketStats;

/** これより掲載が少ない県は、1 週間の差が収集の揺れに埋もれる。 */
export const MIN_N = 300;

export function weeklyMoveFor(pref: string): PrefectureWeeklyMove | undefined {
  /* この項目を足す前に焼いた JSON では undefined。落とさない */
  return (stats.weeklyMoves ?? []).find((m) => m.prefecture === pref);
}

/** 2026-09-09 → 9/9。年は同じ頁に出ているので省く。 */
function md(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/** +1.6% / −0.4% / ±0.0%。符号を必ず付ける（0 も「変わらず」と読める）。 */
function signedPct(v: number): string {
  if (v > 0) return `+${v.toFixed(1)}%`;
  if (v < 0) return `−${Math.abs(v).toFixed(1)}%`;
  return "±0.0%";
}

function signedInt(v: number): string {
  if (v > 0) return `+${v.toLocaleString()}`;
  if (v < 0) return `−${Math.abs(v).toLocaleString()}`;
  return "±0";
}

function Figure({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <div className="text-[10px] font-bold tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm text-slate-800">
        {value}
        {delta && (
          <span className="ml-2 text-[11px] text-slate-600">{delta}</span>
        )}
      </div>
    </div>
  );
}

export function PrefWeeklyMove({ pref }: { pref: string }) {
  const m = weeklyMoveFor(pref);
  if (!m || m.n < MIN_N) return null;

  return (
    <section
      className="mt-10 rounded-2xl border border-slate-300 bg-white/90 p-5"
      aria-labelledby="pref-weekly-move"
    >
      <h2 id="pref-weekly-move" className="text-base font-bold font-serif">
        この 1 週間の動き
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-slate-700">
        {md(m.baseDate)} → {md(m.latestDate)}
        の集計を比べています。当サイトが収集している賃貸掲載の範囲での数字で、市場全体ではありません。
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Figure
          label="掲載数"
          value={`${m.n.toLocaleString()}件`}
          delta={signedInt(m.nDelta)}
        />
        <Figure
          label="家賃中央値"
          value={`${m.medianRent.toLocaleString()}円`}
          delta={signedPct(m.medianRentDeltaPct)}
        />
        <Figure
          label="㎡単価中央値"
          value={`${m.medianSqmRent.toLocaleString()}円/㎡`}
          delta={signedPct(m.medianSqmRentDeltaPct)}
        />
        <Figure
          label="新しく出た掲載（7 日）"
          value={`${m.newListings7d.toLocaleString()}件`}
        />
        {/* 値下げ・値上げは数えられる環境でだけ出す。null は「数えて
            いない」で、0 件とは違う */}
        {m.priceCuts7d !== null && m.priceRises7d !== null && (
          <Figure
            label="値下げ / 値上げ（7 日）"
            value={`${m.priceCuts7d.toLocaleString()} / ${m.priceRises7d.toLocaleString()}件`}
          />
        )}
      </div>
    </section>
  );
}
