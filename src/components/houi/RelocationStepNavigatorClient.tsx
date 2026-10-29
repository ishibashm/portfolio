"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
/* 暦エンジン（lunar-javascript）を引かないよう、葉の directionGeo からだけ読む */
import { DIRECTION_LABELS, type CompassDirection } from "@/utils/directionGeo";
import type {
  FourLucky,
  LuckyAreaItem,
  OriginOption,
} from "@/lib/relocationStepNavigator";

export interface StarStep {
  star: number;
  name: string;
  good: CompassDirection[];
  bad: { direction: CompassDirection; label: string }[];
  fourLucky: FourLucky[];
}

const yen = (n: number) => `${Math.round(n / 1000) / 10}万円`;

export function RelocationStepNavigatorClient({
  year,
  steps,
  initialStar,
  origins,
}: {
  year: number;
  steps: StarStep[];
  initialStar: number | null;
  origins: OriginOption[];
}) {
  const [star, setStar] = useState<number | null>(initialStar);
  const [origin, setOrigin] = useState("");
  const [areas, setAreas] = useState<LuckyAreaItem[] | null>(null);
  const [error, setError] = useState(false);
  const step = steps.find((s) => s.star === star) ?? null;
  const dirs = step?.good.join(",") ?? "";

  useEffect(() => {
    if (!origin || !dirs) return;
    let alive = true;
    fetch(`/api/houi/lucky-areas?origin=${origin}&dirs=${dirs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j: { areas: LuckyAreaItem[] }) => {
        if (alive) {
          setAreas(j.areas);
          setError(false);
        }
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [origin, dirs]);

  return (
    <section
      aria-labelledby="relocation-steps"
      className="mt-10 rounded-2xl border border-slate-300 bg-white/90 p-5"
    >
      <h2 id="relocation-steps" className="text-xl font-bold font-serif">
        引越し先を 3 ステップで絞る
      </h2>
      <p className="mt-1 text-xs text-slate-600">
        方位（九星気学）→ 街と家賃 → 部屋の向き（八宅風水）の順に見ます。2
        つの流派の点数は合算しません。
      </p>

      {/* Step 1 */}
      <div className="mt-5">
        <h3 className="text-sm font-bold">1. {year}年の吉方位（九星気学）</h3>
        {initialStar === null && (
          <div
            className="mt-2 flex flex-wrap gap-2"
            role="group"
            aria-label="本命星を選ぶ"
          >
            {steps.map((s) => (
              <button
                key={s.star}
                type="button"
                onClick={() => {
                  setStar(s.star);
                  setAreas(null);
                }}
                aria-pressed={star === s.star}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  star === s.star
                    ? "border-rose-500 bg-rose-50 text-rose-700"
                    : "border-slate-300 bg-white hover:border-rose-400"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
        {step ? (
          <div className="mt-2 text-sm">
            <p>
              <b>{step.name}</b>の吉方位：
              {step.good.length > 0 ? (
                <b className="text-emerald-700">
                  {step.good.map((d) => DIRECTION_LABELS[d]).join("・")}
                </b>
              ) : (
                <b className="text-rose-700">今年は吉方位がありません</b>
              )}
            </p>
            {step.bad.length > 0 && (
              <p className="mt-1 text-xs text-slate-600">
                避ける方位：
                {step.bad
                  .map((b) => `${DIRECTION_LABELS[b.direction]}（${b.label}）`)
                  .join("・")}
                。暗剣殺・五黄殺は誰にとっても凶です。
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-600">
            本命星を選んでください。
          </p>
        )}
      </div>

      {/* Step 2 */}
      <div className="mt-6">
        <h3 className="text-sm font-bold">
          2. 今の住まいから吉方位にある街と家賃
        </h3>
        <label className="mt-2 block text-xs text-slate-600">
          出発地（今住んでいる市区町村）
          <select
            value={origin}
            onChange={(e) => {
              setOrigin(e.target.value);
              setAreas(null);
            }}
            disabled={!step || step.good.length === 0}
            className="mt-1 block w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">選択してください</option>
            {origins.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="mt-2 text-xs text-rose-700">読み込みに失敗しました。</p>
        )}
        {areas && areas.length === 0 && (
          <p className="mt-2 text-xs text-slate-600">
            150km 以内の吉方位に掲載中の街がありません。
          </p>
        )}
        {areas && areas.length > 0 && (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {areas.map((a) => (
              <li
                key={a.code}
                className="rounded-xl border border-slate-200 bg-white p-3 text-xs"
              >
                <Link
                  prefetch={false}
                  href={`/houi/area/${a.code}`}
                  rel={a.indexable ? undefined : "nofollow"}
                  className="font-bold text-rose-600 underline hover:text-rose-700"
                >
                  {a.name}
                </Link>
                <span className="ml-2 text-slate-500">
                  {DIRECTION_LABELS[a.direction]}・{a.distanceKm}km
                </span>
                <div className="mt-1 font-mono text-slate-700">
                  家賃中央値 {yen(a.medianRent)}（出発地比{" "}
                  {a.rentDiffPct > 0 ? "+" : ""}
                  {a.rentDiffPct}%）
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Step 3 */}
      <div className="mt-6">
        <h3 className="text-sm font-bold">
          3. 部屋・玄関の向き（八宅風水の四吉方）
        </h3>
        <p className="mt-1 text-xs text-slate-600">
          九星気学とは別の流派です。合算はしません。内見時の玄関・寝室の向きの参考に。
        </p>
        {step ? (
          <ul className="mt-2 space-y-1 text-sm">
            {step.fourLucky.map((f) => (
              <li key={f.sex}>
                {f.sex === "male" ? "男性" : "女性"}（{f.guaName}・{f.group}）：
                {f.directions
                  .map((d) => `${d.youxing}=${DIRECTION_LABELS[d.direction]}`)
                  .join("、")}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-slate-600">
            本命星を選ぶと表示します。
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/relocation/simulator"
          className="inline-flex rounded-full bg-rose-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-rose-700"
        >
          この条件で引越し先を試算する
        </Link>
        <Link
          href="/relocation/candidates"
          className="inline-flex rounded-full border border-rose-300 px-5 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50"
        >
          候補物件を管理する
        </Link>
      </div>
    </section>
  );
}
