"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  MAX_BIRTH_YEAR,
  MIN_BIRTH_YEAR,
  isValidBirthDateInput,
  lookupHonmei,
  type HonmeiLookupResult,
} from "@/lib/honmeiLookup";
import { loadSettings } from "@/lib/userSettings";

/**
 * 生年月日から本命星を引く早見。/houi の生まれ年の表の上に置く。
 *
 * 年の表は「1月1日〜立春前は前年」の断りを利用者に読ませる作りで、
 * 読み飛ばすと 1 年ずれる。年月日まで入れてもらえば立春の判定は
 * `lookupHonmei` が済ませるので、その罠が消える。立春当日の生まれは
 * 時刻で分かれるため、片方に決めずに両方を出す。
 *
 * `FengShuiLookup` はプロフィール自動入力を採らなかったが、あちらは
 * **年だけ**の入力なので立春の断りを自力で読む必要があったため。
 * ここは年月日で受けるので、プロフィールの生年月日をそのまま使える。
 *
 * 星の名前と行き先の年は props で受ける。`kigakuContent` を import
 * すると ephemerisEngine（→ lunar-javascript）が値として client
 * バンドルに乗るため（`FengShuiLookup` 冒頭の注意と同じ）。
 * 計算そのものは `lookupHonmei` が動的 import で読み込む。
 */

type Props = {
  starNames: Record<number, string>;
  /** 「◯年の吉方位を見る」リンクの年。サーバ側の years[0] を渡す。 */
  linkYear: number;
};

export function HonmeiLookup({ starNames, linkYear }: Props) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<HonmeiLookupResult | null>(null);
  const [notice, setNotice] = useState("");
  // 動的 import を挟むので、遅く返ってきた古い結果で上書きしない
  const seq = useRef(0);

  const applyDate = async (next: string) => {
    setValue(next);
    setNotice("");
    const my = ++seq.current;
    if (!isValidBirthDateInput(next)) {
      setResult(null);
      return;
    }
    const r = await lookupHonmei(next);
    if (seq.current === my) setResult(r);
  };

  const loadFromProfile = async () => {
    setNotice("");
    // スキャナーが即時保存する localStorage を土台に、共有設定
    // （ログイン中はクラウド同期）があれば上書きする。timing と同じ形。
    let stored = "";
    try {
      stored = localStorage.getItem("arb_birthDate") || "";
    } catch {
      /* プライベートモード等。共有設定だけで続行 */
    }
    const { settings } = await loadSettings();
    const fromConfig =
      typeof settings.birth_date === "string" ? settings.birth_date : "";
    const next = fromConfig || stored;
    if (!next) {
      setNotice(
        "プロフィールに生年月日が見つかりませんでした。物件スキャナーやホームの設定で保存すると、ここから呼び出せます。",
      );
      return;
    }
    if (!isValidBirthDateInput(next)) {
      setNotice(
        "保存されている生年月日が読み取れませんでした。下の欄に直接入力してください。",
      );
      return;
    }
    await applyDate(next);
  };

  const starLine = (classical: number, physical: number) => (
    <>
      <b className="font-serif text-base">{starNames[classical]}</b>
      {physical !== classical && (
        <span className="ml-2 text-xs text-slate-600">
          （独自モデルでは{starNames[physical]}）
        </span>
      )}
    </>
  );

  return (
    <div className="mt-5 rounded-2xl border border-slate-300 bg-white/90 p-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="block text-xs font-bold text-slate-700">
            生年月日
          </span>
          <input
            type="date"
            value={value}
            min={`${MIN_BIRTH_YEAR}-01-01`}
            max={`${MAX_BIRTH_YEAR}-12-31`}
            onChange={(e) => void applyDate(e.target.value)}
            className="mt-1.5 w-44 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => void loadFromProfile()}
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
        >
          プロフィールから読み込む
        </button>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-600">
        年月日まで入れると、
        <b>立春前の生まれを前年として数える判定まで自動で行います</b>
        。入力はこの端末の中だけで計算し、送信しません。
      </p>

      {notice && (
        <p className="mt-3 text-xs leading-relaxed text-amber-800">{notice}</p>
      )}

      {result && !result.classicalChanges && (
        <div className="mt-4">
          <p className="text-sm">
            あなたの本命星は{" "}
            {starLine(result.dayStart.classical, result.dayStart.physical)}
          </p>
          {result.physicalChanges && (
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              独自モデル（木星黄経）はこの日のうちに切り替わります。生まれた時刻が遅い場合は
              {starNames[result.dayEnd.physical]}
              になります。一般的な九星気学の本命星は変わりません。
            </p>
          )}
          <Link
            prefetch={false}
            href={`/houi/${linkYear}/${result.dayStart.classical}`}
            className="mt-2 inline-flex text-xs font-bold text-rose-600 hover:underline"
          >
            {linkYear}年の吉方位を見る →
          </Link>
        </div>
      )}

      {result && result.classicalChanges && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-bold text-amber-900">
            この日は立春です。生まれた<b>時刻</b>で本命星が分かれます。
          </p>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-amber-900">
            <li>
              立春の瞬間より<b>前</b>に生まれた場合:{" "}
              {starLine(result.dayStart.classical, result.dayStart.physical)}
              <Link
                prefetch={false}
                href={`/houi/${linkYear}/${result.dayStart.classical}`}
                className="ml-2 font-bold text-rose-600 hover:underline"
              >
                {linkYear}年の吉方位 →
              </Link>
            </li>
            <li>
              立春の瞬間より<b>後</b>に生まれた場合:{" "}
              {starLine(result.dayEnd.classical, result.dayEnd.physical)}
              <Link
                prefetch={false}
                href={`/houi/${linkYear}/${result.dayEnd.classical}`}
                className="ml-2 font-bold text-rose-600 hover:underline"
              >
                {linkYear}年の吉方位 →
              </Link>
            </li>
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-amber-800">
            立春の時刻は年ごとに違います（2月3日〜4日ごろ）。母子手帳などで出生時刻を確認してください。
          </p>
        </div>
      )}
    </div>
  );
}
