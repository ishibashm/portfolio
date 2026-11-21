"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ShirubeWanderer,
  usePrefersReducedMotion,
  type ShirubeWanderSnapshot,
} from "@/components/guide/ShirubeWanderer";

const STATE_LABELS: Record<ShirubeWanderSnapshot["state"], string> = {
  walking: "歩行中",
  paused: "ひと休み中",
  turning: "振り返り中",
  idle: "静止（reduced-motion）",
};

const DUMMY_CARDS = [
  {
    eyebrow: "方位の目安",
    title: "今いる場所から八方位を見渡す",
    body: "画面の下端をしるべがゆっくり行き来する様子を、通常コンテンツの横幅と合わせて確認するためのダミーカードです。本文の可読性や操作を邪魔しない距離感を保ちます。",
  },
  {
    eyebrow: "時期の整理",
    title: "動く候補日を静かに見比べる",
    body: "足の振り・体の上下・左右反転はすべて CSS transform だけで動かし、重いアニメーションライブラリは使いません。画像は 3 枚合わせて 100KB 未満です。",
  },
  {
    eyebrow: "相場の確認",
    title: "家賃と暮らしやすさを並べて考える",
    body: "スマホ幅では高さ 60px に小さく収め、ラッパーには pointer-events: none を当てています。画面下に固定のボタン帯があるときは、その上を歩きます。",
  },
] as const;

export function ShirubeDemoClient() {
  // デモ限定の「動きを止める」トグル。既定は false（OS の prefers-reduced-motion に従う）。
  const [stopMotionToggle, setStopMotionToggle] = useState(false);
  // デモ限定: スマホでよくある「画面下に固定された CTA 帯」を出して、よけ方を確かめる
  const [showFixedCta, setShowFixedCta] = useState(false);
  const osReduced = usePrefersReducedMotion();
  const [snapshot, setSnapshot] = useState<ShirubeWanderSnapshot>({
    motion: "reduced",
    state: "idle",
    facing: "left",
  });
  const [tapLog, setTapLog] = useState<string>("まだ押されていません");
  const [tapCount, setTapCount] = useState<number>(0);

  const recordTap = (label: string) => {
    setTapCount((prev) => prev + 1);
    setTapLog(`「${label}」を押せました`);
  };

  return (
    <div className="min-h-screen bg-[#faf7f3] text-[#1e2a5a]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-32 pt-8 sm:px-6 lg:px-8">
        {/* ヘッダー */}
        <header className="rounded-2xl border border-[#c9a54a]/45 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1.5">
              <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-[#1e2a5a]">
                <span className="rounded bg-[#1e2a5a] px-2 py-0.5 text-[11px] text-[#f3d98b]">
                  試作デモ
                </span>
                <span>検索非公開（noindex / Disallow: /demo）</span>
              </p>
              <h1 className="text-xl font-bold tracking-tight text-[#1e2a5a] sm:text-2xl">
                しるべ 画面下端歩き回りプロトタイプ
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-700">
                部品分け（頭と体・手前の足・奥の足）にしたちびしるべが、画面の一番下のふちを舞台の床のように歩いたり立ち止まったりする試作です。歩くあいだは足を交互に振って体が小さくはずみ、止まると足をそろえて静かに呼吸します。
              </p>
            </div>

            {/* デモ限定の動きトグル */}
            <div className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-[#faf7f3] p-3.5 sm:items-end">
              <button
                type="button"
                role="switch"
                aria-checked={stopMotionToggle}
                onClick={() => setStopMotionToggle((prev) => !prev)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
                  stopMotionToggle
                    ? "border-[#1e2a5a] bg-[#1e2a5a] text-[#f3d98b]"
                    : "border-[#c9a54a] bg-white text-[#1e2a5a] hover:bg-[#f8f1dc]"
                }`}
              >
                <span>
                  {stopMotionToggle
                    ? "動きを停止中（reduced-motion 相当）"
                    : "動きを止める（reduced-motion 確認）"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setShowFixedCta((v) => !v)}
                aria-pressed={showFixedCta}
                className="rounded-full border border-[#1e2a5a]/40 bg-white px-4 py-2 text-xs font-semibold text-[#1e2a5a] hover:bg-[#faf7f3]"
              >
                {showFixedCta
                  ? "下部の固定ボタン帯を消す"
                  : "下部の固定ボタン帯を出す（よけ方の確認）"}
              </button>
              <p className="text-xs text-slate-600">
                状態:{" "}
                <strong className="text-[#1e2a5a]">
                  {STATE_LABELS[snapshot.state]}
                </strong>
                {" / "}
                向き:{" "}
                <strong className="text-[#1e2a5a]">
                  {snapshot.facing === "left" ? "左" : "右"}
                </strong>
                {" / "}
                OS 設定: {osReduced ? "動きを減らす" : "通常"}
              </p>
            </div>
          </div>
        </header>

        {/* 横幅のあるダミーコンテンツ */}
        <section
          aria-label="ダミー本文カード"
          className="grid gap-5 md:grid-cols-3"
        >
          {DUMMY_CARDS.map((card) => (
            <article
              key={card.title}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-wider text-[#9c7926]">
                  {card.eyebrow}
                </p>
                <h2 className="text-base font-bold text-[#1e2a5a]">
                  {card.title}
                </h2>
                <p className="text-sm leading-relaxed text-slate-700">
                  {card.body}
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => recordTap(card.title)}
                  className="text-xs font-semibold text-[#1e2a5a] underline decoration-[#c9a54a] underline-offset-4 hover:text-[#9c7926]"
                >
                  カードのダミー操作を試す
                </button>
              </div>
            </article>
          ))}
        </section>

        {/* 広い余白と仕様メモ */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-bold text-[#1e2a5a]">
            確認ポイント（タップ領域・スマホ幅・reduced-motion）
          </h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-[#faf7f3] p-4">
              <dt className="font-semibold text-[#1e2a5a]">
                タップ・クリックを塞がない
              </dt>
              <dd className="mt-1 leading-relaxed text-slate-700">
                しるべのステージ全体は{" "}
                <code className="rounded bg-white px-1 py-0.5 text-xs">
                  pointer-events: none
                </code>{" "}
                です。下端や角のボタンがしるべの背後になってもそのまま押せます。
              </dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-[#faf7f3] p-4">
              <dt className="font-semibold text-[#1e2a5a]">
                reduced-motion 時は静止表示
              </dt>
              <dd className="mt-1 leading-relaxed text-slate-700">
                OS が「視差効果を減らす」設定のとき（または上のトグル ON
                時）はアニメーションを一切回さず、右下端に静かに佇みます。
              </dd>
            </div>
          </dl>
        </section>

        {/* 下部・角のサンプルボタンとリンク（操作が塞がれていないことの確認用） */}
        <section
          aria-label="下部の操作確認エリア"
          className="rounded-2xl border border-[#c9a54a]/50 bg-white p-6 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-[#1e2a5a]">
              画面下部・角のサンプルボタン確認
            </h2>
            <p
              aria-live="polite"
              className="rounded-full bg-[#faf7f3] px-3 py-1 text-xs font-medium text-[#1e2a5a] border border-slate-200"
            >
              操作確認（{tapCount} 回）: {tapLog}
            </p>
          </div>
          <p className="mt-2 text-sm text-slate-700">
            しるべが画面最下端を歩いていても、以下の下部ボタンやリンクが問題なく押せることを確かめられます。
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => recordTap("左下サンプルボタン")}
              className="rounded-full border border-[#1e2a5a] bg-white px-5 py-2.5 text-sm font-semibold text-[#1e2a5a] transition-colors hover:bg-[#faf7f3]"
            >
              左下サンプルボタン
            </button>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/"
                className="rounded-full border border-[#c9a54a] bg-[#f8f1dc] px-5 py-2.5 text-sm font-semibold text-[#1e2a5a] transition-colors hover:bg-[#f3d98b]/60"
              >
                トップページへ戻る
              </Link>
              <button
                type="button"
                onClick={() => recordTap("右下サンプルCTA")}
                className="rounded-full bg-[#1e2a5a] px-5 py-2.5 text-sm font-semibold text-[#f3d98b] shadow-sm transition-opacity hover:opacity-90"
              >
                右下サンプル CTA
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* 画面下端の四隅にもダミー操作を置いて、最下端でも塞がれないことを確かめる */}
      <div className="pointer-events-none fixed inset-x-0 bottom-3 z-20 mx-auto flex max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => recordTap("最下端・左角ボタン")}
          className="pointer-events-auto rounded-full border border-[#c9a54a] bg-white/95 px-3.5 py-1.5 text-xs font-semibold text-[#1e2a5a] shadow-sm hover:bg-[#f8f1dc]"
        >
          左角テストボタン
        </button>
        <button
          type="button"
          onClick={() => recordTap("最下端・右角ボタン")}
          className="pointer-events-auto rounded-full border border-[#1e2a5a]/40 bg-white/95 px-3.5 py-1.5 text-xs font-semibold text-[#1e2a5a] shadow-sm hover:bg-[#f8f1dc]"
        >
          右角テストボタン
        </button>
      </div>

      {showFixedCta ? (
        <div
          data-shirube-avoid
          className="fixed inset-x-0 bottom-0 z-40 border-t border-[#c9a54a]/50 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur"
        >
          <button
            type="button"
            onClick={() => recordTap("固定 CTA 帯のボタン")}
            className="mx-auto block w-full max-w-md rounded-full bg-[#1e2a5a] px-5 py-3 text-sm font-semibold text-[#f3d98b]"
          >
            固定 CTA（例: 今日の吉方位を見る）
          </button>
        </div>
      ) : null}

      <ShirubeWanderer
        forceReducedMotion={stopMotionToggle ? true : undefined}
        onStatusChange={setSnapshot}
      />
    </div>
  );
}
