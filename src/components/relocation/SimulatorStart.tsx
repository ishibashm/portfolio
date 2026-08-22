"use client";

import { useState } from "react";
import { toUserMessage } from "@/lib/errorMessage";
import { todayInJapan } from "@/utils/japanDate";

/**
 * 引越しシミュレータの入口。
 *
 * 開いた時点で、多段ステップ・同行者・迂回ルート・生体センサーの
 * スライダーが一度に出る。最初に何を入れればいいのかが分からない。
 *
 * それだけなら「深い」で済むが、実際にはもっと悪かった。初期値として
 * 運営者の生年月日と、作った覚えのない計画
 * （京都市 → 名古屋市 / 2026-06-30 / 一時赴任）が入っていて、
 * それに対する判定まで出る。本番で「総合シンクロ指数 76/100 EXCELLENT」
 * 「安心してそのまま計画を実行してください」と表示されていた。
 * 初めて来た人は、これを自分の結果だと読む。
 *
 * ここでは「生年月日・出発地・行き先・時期」の 4 つを聞いて、1 本の試算に入る。
 * 多段・同行者・迂回は、入ったあとに足す形にする（機能は消していない）。
 *
 * ## 行き先を入口で聞く理由
 *
 * 以前は聞いていなかった。「1 つ目のステップで選ぶ」つもりだったが、
 * **押した先に結果が出ない。**行き先が空なので方位が決まらず、3,085 行の
 * 画面に放り出されるだけになる。目的地の入力欄は 9px のラベルで他の項目に
 * 埋もれていて、次に何をすればいいかも分からない。
 *
 * 利用者から「使い方が本当に分からない」と報告があった。**押したら結果が
 * 出る**のが、この画面のいちばん短い説明になる。
 *
 * 下書きから戻した人は行き先が既に入っているので、その値を初期値にする。
 */

export interface SimulatorStartValues {
  birthDate: string;
  startName: string;
  startLat: number;
  startLon: number;
  toName: string;
  toLat: number;
  toLon: number;
  departureDate: string;
}

export function SimulatorStart({
  onStart,
  onShowExample,
  initialDestination = "",
}: {
  onStart: (v: SimulatorStartValues) => void;
  /** 例で動きを見たい人向け。初期値の計画をそのまま開く。 */
  onShowExample: () => void;
  /** 下書きから戻したときの行き先。空なら未入力 */
  initialDestination?: string;
}) {
  const [birthDate, setBirthDate] = useState("");
  const [place, setPlace] = useState("");
  const [destination, setDestination] = useState(initialDestination);
  const [departureDate, setDepartureDate] = useState(todayInJapan());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 住所を 1 つ引く。見つからなければ null。 */
  async function lookup(
    query: string,
  ): Promise<{ name: string; lat: number; lon: number } | null> {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
    const json = await res.json();
    if (!res.ok || typeof json?.lat !== "number") return null;
    return { name: json.name || query.trim(), lat: json.lat, lon: json.lon };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!birthDate) {
      setError("生年月日を入れてください。本命星の判定に使います。");
      return;
    }
    if (!place.trim()) {
      setError(
        "いま住んでいる場所を入れてください。方位はここから決まります。",
      );
      return;
    }
    if (!destination.trim()) {
      setError(
        "引越し先を入れてください。ここが無いと方位が決まらず、試算になりません。",
      );
      return;
    }

    setBusy(true);
    try {
      /*
        2 つとも引いてから進む。片方だけ通して先へ行くと、方位が
        決まらないまま画面が開く（それが「使い方が分からない」の正体）。
      */
      const [from, to] = await Promise.all([
        lookup(place),
        lookup(destination),
      ]);
      if (!from) {
        setError(
          "いま住んでいる場所が見つかりませんでした。市区町村までで試してください（例: 京都市下京区）。",
        );
        return;
      }
      if (!to) {
        setError(
          "引越し先が見つかりませんでした。市区町村までで試してください（例: 名古屋市中区）。",
        );
        return;
      }
      onStart({
        // 時刻の入力までは求めない。本命星は日で決まる。
        birthDate: birthDate.includes("T") ? birthDate : `${birthDate}T12:00`,
        startName: from.name,
        startLat: from.lat,
        startLon: from.lon,
        toName: to.name,
        toLat: to.lat,
        toLon: to.lon,
        departureDate,
      });
    } catch (err) {
      setError(toUserMessage(err, "住所を調べられませんでした。"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-bold text-stone-800">
        4 つ入れると、結果が出ます
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-stone-500">
        方位は「いま住んでいる場所から、引越し先を見てどの向きか」で決まります。だから両方が要ります。同行者や、大凶を避ける迂回ルートは、このあとで足せます。
      </p>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-stone-600">
            生年月日
          </span>
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="w-full rounded-xl border border-stone-300 p-2.5 text-sm"
          />
          <span className="mt-1 block text-[11px] text-stone-600">
            本命星と天中殺を出すのに使います。保存はされません。
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-stone-600">
            いま住んでいる場所
          </span>
          <input
            type="text"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="例: 京都市下京区"
            className="w-full rounded-xl border border-stone-300 p-2.5 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-stone-600">
            引越し先
          </span>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="例: 名古屋市中区"
            className="w-full rounded-xl border border-stone-300 p-2.5 text-sm"
          />
          <span className="mt-1 block text-[11px] text-stone-600">
            候補が複数あるなら、まず 1 つで試してください。あとから足せます。
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-stone-600">
            動きたい時期
          </span>
          <input
            type="date"
            value={departureDate}
            onChange={(e) => setDepartureDate(e.target.value)}
            className="w-full rounded-xl border border-stone-300 p-2.5 text-sm"
          />
        </label>

        {error && (
          <p className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-stone-800 px-5 py-2.5 text-sm text-white transition disabled:opacity-40"
        >
          {busy ? "調べています…" : "この引越しを試算する"}
        </button>
      </form>

      <button
        type="button"
        onClick={onShowExample}
        className="mt-4 text-[11px] text-stone-500 underline"
      >
        先に例で動きを見る（京都市 → 名古屋市）
      </button>
    </div>
  );
}
