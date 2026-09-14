"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";

/**
 * 「いま出ている判定は、登録されていない人のための**見本**です」と断る帯。
 *
 * ## なぜ要るか
 *
 * 画面は計算のために生年月日の初期値（`2000-01-01T00:00`）を持っている。
 * 2026-09-13 に実測したところ、プロフィール未登録で開くと**その人の
 * 本命星（一白水星）と方位の吉凶**が「あなたの」として出ていた。すぐ上の
 * 帯は「プロフィールが未設定です」と言っており、同じ画面が矛盾していた。
 *
 * 出すのをやめる案もあったが、**初めて来た人に道具の中身が伝わらなくなる。**
 * 利用者の判断（2026-09-13）で「見本と明記して出す」を採った。
 *
 * ## 書き方の決め
 *
 * - **誰の例かを具体的に書く。**「例です」とだけ書くと、自分の判定だと
 *   思ったまま読み進められる
 * - **どこが見本なのかを書く。**画面の一部（地図と刻）だけが見本で、
 *   暦や宇宙天気は誰にとっても同じ
 * - 登録への入口をその場に置く
 *
 * ## 同じ状況に 3 通りの言い方があった（2026-09-14）
 *
 * `/calendar` の吉日（`AuspiciousDayFinder`）は「いまの結果は仮の設定に
 * よるものです」、`QuickProfileBar` は「仮の値（2000-01-01・東京）で計算
 * した結果です」と、**画面ごとに別の文言を持っていた。**言い方が違うと
 * 「これは別のことを言っているのか」と読める。CLAUDE.md 4 節「サイトの
 * 言葉と評価の一貫性」。
 *
 * 見本なのが何かは画面ごとに違うので、`what` / `unaffected` で受け取る。
 * **文の骨格は 1 つ**にして、差し替えるのは中身だけにする。
 */
export function SampleProfileNotice({
  /** 見本に使っている生年月日の表示（例: 2000 年 1 月 1 日）。 */
  birthLabel,
  /** 見本の本命星（例: 一白水星）。出せないときは省く。 */
  starLabel,
  /** 何が見本の値で出ているか（例: 方位の吉凶と刻の判定）。 */
  what = "方位の吉凶と刻の判定",
  /**
   * 誰が見ても同じもの。**空文字なら出さない。**「全部が見本」の画面で
   * 無理に書くと嘘になる。
   */
  unaffected = "暦・宇宙天気・地図そのものは誰が見ても同じです。",
  className = "",
}: {
  birthLabel: string;
  starLabel?: string;
  what?: string;
  unaffected?: string;
  className?: string;
}) {
  return (
    <p
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] leading-relaxed text-indigo-900 ${className}`}
    >
      <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        <b className="text-indigo-950">これは見本です。</b>
        {`生年月日が未登録のため、${what}は`}
        <b className="mx-1">
          {birthLabel}生まれ{starLabel ? `（${starLabel}）` : ""}
        </b>
        {`の例で出しています。${unaffected}`}
      </span>
      <Link
        href="/profile"
        className="inline-flex min-h-[24px] items-center font-bold underline hover:text-indigo-950"
      >
        自分の生年月日で見る
      </Link>
    </p>
  );
}

export default SampleProfileNotice;
