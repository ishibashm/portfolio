"use client";

import { useState } from "react";
import { PlaceInput } from "@/components/relocation/PlaceInput";
import type { Appraisal } from "@/utils/appraisal";

/**
 * 検討中の物件を 1 件入力して、近所の成約の分布に当てる。
 *
 * ## 出す順
 *
 * 結論（高いか安いか）→ 根拠（成約の幅）→ 明細（何件・どこまで緩めたか）。
 * 利回りマップと同じ順にする。
 *
 * ## 断らないといけないこと
 *
 * **どこまで条件を緩めたか**と**成約の時点**は、数字と同じ大きさで出す。
 * 「隣の区画まで含めて築年を問わず 5 件」で出した数字を、何も言わずに
 * 「相場は 4,200 万円」と見せると、根拠のある数字に見えてしまう。
 */

interface Response {
  appraisal: Appraisal | null;
  candidatesNearby: number;
  years: { from: number; to: number };
}

/** 円を「4,250 万円」の形へ。桁を読み違えるのがいちばん怖い。 */
function man(yen: number): string {
  return `${Math.round(yen / 10_000).toLocaleString()} 万円`;
}

/** ㎡単価を「52.4 万円/㎡」の形へ。 */
function manPerSqm(yen: number): string {
  return `${(yen / 10_000).toFixed(1)} 万円/㎡`;
}

/**
 * 売出価格の位置づけを言葉にする。
 *
 * **色は付けない。**赤や緑にすると「買ってよい／いけない」と読まれる。
 * ここで言えるのは価格の位置だけで、その物件が良いかどうかではない。
 */
function positionLabel(ratioBelow: number): string {
  if (ratioBelow >= 0.9) return "近所の成約のほとんどより高い";
  if (ratioBelow >= 0.7) return "近所の成約より高いほう";
  if (ratioBelow >= 0.3) return "近所の成約の真ん中あたり";
  if (ratioBelow >= 0.1) return "近所の成約より安いほう";
  return "近所の成約のほとんどより安い";
}

export function AppraisalForm() {
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [areaSqm, setAreaSqm] = useState("");
  const [builtYear, setBuiltYear] = useState("");
  const [askingMan, setAskingMan] = useState("");
  const [result, setResult] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ready = lat !== null && lon !== null && Number(areaSqm) > 0;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/relocation/appraisal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lat,
          lon,
          areaSqm: Number(areaSqm),
          builtYear: builtYear ? Number(builtYear) : null,
          // 入力は万円。API には円で渡す。
          askingPrice: askingMan ? Number(askingMan) * 10_000 : null,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setResult(body.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "査定できませんでした。");
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const a = result?.appraisal ?? null;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-stone-200 bg-white p-4 space-y-4">
        <PlaceInput
          label="物件の場所"
          lat={lat}
          lon={lon}
          onChange={(nextLat, nextLon) => {
            setLat(nextLat);
            setLon(nextLon);
          }}
          variant="form"
          help="住所か駅名を入れてください。近所の成約を探す起点になります。"
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-sm font-bold text-stone-700">
              専有面積（㎡）
            </span>
            <input
              type="number"
              inputMode="decimal"
              value={areaSqm}
              onChange={(e) => setAreaSqm(e.target.value)}
              placeholder="70"
              className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:border-indigo-300 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-stone-700">
              建築年（西暦）
              <span className="ml-1.5 text-[11px] font-normal text-stone-500">
                任意
              </span>
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={builtYear}
              onChange={(e) => setBuiltYear(e.target.value)}
              placeholder="2005"
              className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:border-indigo-300 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-stone-700">
              売出価格（万円）
              <span className="ml-1.5 text-[11px] font-normal text-stone-500">
                任意
              </span>
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={askingMan}
              onChange={(e) => setAskingMan(e.target.value)}
              placeholder="4500"
              className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:border-indigo-300 focus:outline-none"
            />
          </label>
        </div>

        <p className="max-w-[70ch] text-[11px] leading-relaxed text-stone-500">
          建築年を入れると、近い世代の建物だけで比べます。売出価格を入れると、その価格が近所の成約のどのあたりかを出します。どちらも空のままで相場だけ見られます。
        </p>

        <button
          type="button"
          onClick={submit}
          disabled={!ready || busy}
          className="rounded-xl bg-stone-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-stone-900 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {busy ? "近所の成約を調べています…" : "近所の成約と比べる"}
        </button>
      </section>

      {error && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-stone-800">
          {error}
        </p>
      )}

      {result && !a && (
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-bold text-stone-800">
            この場所では出せませんでした
          </h2>
          <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-stone-600">
            条件をいちばん緩めても、比べられる成約が 5 件に届きませんでした。
            <strong>足りないまま出すより、出せないと言うほうがよい</strong>
            と考えています。
          </p>
          <p className="mt-2 text-[11px] font-mono text-stone-500">
            近所（区画 2 つぶんの範囲）にあった中古マンションの成約:{" "}
            {result.candidatesNearby} 件／対象年 {result.years.from}〜
            {result.years.to}
          </p>
          <p className="mt-2 max-w-[70ch] text-[12px] leading-relaxed text-stone-600">
            {result.candidatesNearby === 0
              ? "この範囲には中古マンションの成約がありません。郊外や、マンションの少ない地域だとこうなります。"
              : "成約はありましたが、面積や築年が離れすぎていました。面積の入力を見直すか、別の物件で試してください。"}
          </p>
        </section>
      )}

      {a && (
        <>
          {/* 結論 */}
          {a.asking && (
            <section className="rounded-2xl border border-stone-200 bg-white p-5">
              <p className="text-[11px] font-bold text-stone-500">
                入力した売出価格の位置づけ
              </p>
              <p className="mt-1 font-serif text-xl font-bold text-stone-900">
                {positionLabel(a.asking.ratioBelow)}
              </p>
              <p className="mt-2 text-sm text-stone-700">
                近所の成約 <strong className="font-mono">{a.n}</strong> 件のうち{" "}
                <strong className="font-mono">
                  {Math.round(a.asking.ratioBelow * 100)}%
                </strong>{" "}
                が、この価格より安く成立しています。中央値との差は{" "}
                <strong className="font-mono">
                  {a.asking.gapFromMedian >= 0 ? "+" : ""}
                  {(a.asking.gapFromMedian * 100).toFixed(1)}%
                </strong>{" "}
                です。
              </p>
            </section>
          )}

          {/* 根拠 */}
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-[11px] font-bold text-stone-500">
                安いほう（p25）
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-stone-900">
                {man(a.price.low)}
              </p>
              <p className="mt-1 text-[11px] font-mono text-stone-500">
                {manPerSqm(a.perSqm.p25)}
              </p>
            </div>
            <div className="rounded-2xl border-2 border-stone-300 bg-white p-4">
              <p className="text-[11px] font-bold text-stone-500">中央値</p>
              <p className="mt-1 font-mono text-xl font-bold text-stone-900">
                {man(a.price.mid)}
              </p>
              <p className="mt-1 text-[11px] font-mono text-stone-500">
                {manPerSqm(a.perSqm.median)}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-[11px] font-bold text-stone-500">
                高いほう（p75）
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-stone-900">
                {man(a.price.high)}
              </p>
              <p className="mt-1 text-[11px] font-mono text-stone-500">
                {manPerSqm(a.perSqm.p75)}
              </p>
            </div>
          </section>

          {/*
            明細。**数字と同じ画面に置く。**折りたたむと、緩めた条件で
            出した数字が根拠のある数字に見えてしまう。
          */}
          <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <h2 className="text-sm font-bold text-stone-800">
              この数字の出どころ
            </h2>
            <dl className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-stone-700">
              <div>
                <dt className="inline font-bold">比べた成約：</dt>
                <dd className="inline">
                  {a.n} 件（{a.tradeYears.from}〜{a.tradeYears.to} 年に成立）
                </dd>
              </div>
              <div>
                <dt className="inline font-bold">絞り込み：</dt>
                <dd className="inline">{a.tierLabel}</dd>
              </div>
            </dl>
            <ul className="mt-3 space-y-1.5">
              <li className="max-w-[70ch] text-[12px] leading-relaxed text-stone-700">
                ・<strong>時点の補正をしていません。</strong>
                上の数字は {a.tradeYears.from}〜{a.tradeYears.to}{" "}
                年の水準で、今日の水準ではありません。
              </li>
              <li className="max-w-[70ch] text-[12px] leading-relaxed text-stone-700">
                ・<strong>階・向き・管理状態は見ていません。</strong>
                同じ建物でも 2 割は動きます。幅で出しているのはそのためです。
              </li>
              <li className="max-w-[70ch] text-[12px] leading-relaxed text-stone-700">
                ・成約価格は国土交通省の公表値です。売出価格ではないので、
                <strong>実際に成立した額</strong>で比べています。
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
