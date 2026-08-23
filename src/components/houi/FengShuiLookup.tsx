"use client";

import { useState, useSyncExternalStore } from "react";
import { DIRECTION_LABELS } from "@/lib/kigakuContent";
import {
  FENG_SHUI_SERVER_SNAPSHOT,
  fengShuiSnapshot,
  parseSnapshot,
  subscribeFengShui,
  writeFengShuiSettings,
} from "@/lib/fengShuiSettings";
import {
  readFengShui,
  type Sex,
  type FengShuiReading,
} from "@/utils/fengShuiEngine";

/**
 * 風水（八宅）の早見。**九星気学とは別の段に置く。**
 *
 * 同じ頁に置くのは、問いが同じだから——「自分は何で、どの方位が良いか」。
 * 九星気学は生まれ年から本命星、八宅は生まれ年と性別から本命卦を引く。
 * 引き方がそろっているので並べて読める。
 *
 * **足し算はしない。**点にして合計すると、どちらの流派の答えでもない
 * 数字ができる。両方をそのまま出して、利用者が見て決める。
 *
 * 性別は端末にだけ残す（`fengShuiSettings`）。クラウドには送らない。
 * 生まれ年は残さない。**ここは早見表で、他の画面の設定を変える場所では
 * ない。**設定の生年月日を読んで埋める案もあったが、埋めた年をそのまま
 * 使うと「立春前生まれは前年」の断りを読み飛ばした人が 1 年ずれた本命卦を
 * 見る。自分で入れてもらう。
 */

const SEX_LABELS: Record<Sex, string> = {
  male: "男性",
  female: "女性",
};

/** 生まれ年として受け付ける範囲。表の外に出ると本命卦が出せない。 */
const MIN_YEAR = 1900;
const MAX_YEAR = 2050;

export function FengShuiLookup() {
  /*
    localStorage は React の外にある。useEffect の中で setState して
    読み込むと react-hooks/set-state-in-effect に掛かるうえ、サーバ側の
    描画と食い違う。第 3 引数にサーバ側の値を渡せる useSyncExternalStore
    を使う（admin/metrics の計測除外の切り替えと同じ形）。
  */
  const stored = parseSnapshot(
    useSyncExternalStore(
      subscribeFengShui,
      fengShuiSnapshot,
      () => FENG_SHUI_SERVER_SNAPSHOT,
    ),
  );
  const sex = stored.sex;
  const [year, setYear] = useState("");

  const chooseSex = (next: Sex) => writeFengShuiSettings({ sex: next });

  const parsed = Number(year);
  const validYear =
    /^\d{4}$/.test(year) && parsed >= MIN_YEAR && parsed <= MAX_YEAR;
  const reading: FengShuiReading | null =
    validYear && sex ? readFengShui(parsed, sex) : null;

  return (
    <div className="rounded-2xl border border-slate-300 bg-white/90 p-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="block text-xs font-bold text-slate-700">
            生まれ年（西暦）
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="1990"
            className="mt-1.5 w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <div>
          <span className="block text-xs font-bold text-slate-700">性別</span>
          <div className="mt-1.5 flex gap-2">
            {(Object.keys(SEX_LABELS) as Sex[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => chooseSex(s)}
                aria-pressed={sex === s}
                className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                  sex === s
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {SEX_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-600">
        八宅は<b>生まれ年と性別</b>
        で本命卦が決まります。性別を使うのはこの流派の作りによるもので、
        <b>入力はこの端末にだけ残り、送信しません</b>。年は九星気学と同じく
        <b>立春の瞬間で切り替わります</b>
        （2月3日〜4日ごろ。時刻は年ごとに違います）。1月1日から立春前までに生まれた方は
        <b>前年</b>
        を入れてください。立春の日に生まれた方は、生まれた時刻で分かれます。
      </p>

      {!reading && (
        <p className="mt-4 text-xs text-slate-500">
          生まれ年と性別を入れると、八宅の 8 方位が出ます。
        </p>
      )}

      {reading && (
        <div className="mt-5">
          <p className="text-sm">
            あなたの本命卦は{" "}
            <b className="font-serif text-base">{reading.guaName}命</b>
            <span className="ml-2 text-slate-700">（{reading.group}）</span>
          </p>

          {/* 吉凶は色だけで出さない。「吉」「凶」の字と遊星の名前を必ず添える。
              色覚や印刷で色が落ちても読めるようにするため。 */}
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {reading.directions.map((d) => (
              <li
                key={d.direction}
                className={`rounded-xl border p-3 ${
                  d.auspicious
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-rose-300 bg-rose-50"
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-serif text-base font-bold">
                    {DIRECTION_LABELS[d.direction]}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                      d.auspicious
                        ? "bg-emerald-700 text-white"
                        : "bg-rose-700 text-white"
                    }`}
                  >
                    {d.auspicious ? "吉" : "凶"}
                  </span>
                  <span className="text-xs font-bold text-slate-700">
                    {d.youxing}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
                  {d.meaning}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-5 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-600">
        <b>九星気学の判定とは足し合わせません。</b>
        流派が違うものを足すと、どちらの答えでもない数字になります。両方が吉の方位もあれば、片方だけの方位もあります。どちらを重く見るかは決めていません。
      </p>
    </div>
  );
}
