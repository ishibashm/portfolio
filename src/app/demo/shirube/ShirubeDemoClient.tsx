"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ShirubeShuffle } from "@/components/guide/ShirubeShuffle";
import {
  ShirubeWanderer,
  usePrefersReducedMotion,
  type ShirubeWanderSnapshot,
} from "@/components/guide/ShirubeWanderer";

const STATE_LABELS: Record<ShirubeWanderSnapshot["state"], string> = {
  walking: "歩行中",
  paused: "ひと休み中",
  turning: "振り返り中",
  greeting: "正面であいさつ中",
  sitting: "床でひと息中",
  hopping: "ジャンプ中",
  pointing: "指さし案内中",
  idle: "静止（reduced-motion）",
};

const DUMMY_CARDS = [
  {
    id: "direction",
    eyebrow: "方位の目安",
    title: "今いる場所から八方位を見渡す",
    body: "画面下端だけでなく、カードや見出しの上端（床）へ飛び移りながら自由に巡回します。本文を隠さないよう、要素の左右端を優先して立ちます。",
  },
  {
    id: "timing",
    eyebrow: "時期の整理",
    title: "動く候補日を静かに見比べる",
    body: "歩いている間とジャンプ中だけ描画フレームを回し、止まっている間はタイマーで待機します。タブが裏にあるときは動きを止めます。",
  },
  {
    id: "market",
    eyebrow: "相場の確認",
    title: "家賃と暮らしやすさを並べて考える",
    body: "スマホ幅では高さ 60px に収め、床の数も最大 4 か所まで。主要ボタンや入力欄の上には立ち止まらない仕組みです。",
  },
] as const;

export function ShirubeDemoClient() {
  const [stopMotionToggle, setStopMotionToggle] = useState(false);
  const [showFixedCta, setShowFixedCta] = useState(false);
  const [gait, setGait] = useState<"rig" | "shuffle">("rig");
  const [fixSeed, setFixSeed] = useState(false);
  // ?tour=1 のときだけ、録画・確認用に自動案内の間隔を短くする（本番の既定は 45 秒）
  const [tour, setTour] = useState(false);
  useEffect(() => {
    // URL はマウント後にしか読めないので、ここで一度だけ反映する
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTour(new URLSearchParams(window.location.search).get("tour") === "1");
  }, []);
  const osReduced = usePrefersReducedMotion();

  const [snapshot, setSnapshot] = useState<ShirubeWanderSnapshot>({
    motion: "reduced",
    state: "idle",
    facing: "left",
    perchId: "bottom",
    tipId: null,
    hidden: false,
  });

  const [tapLog, setTapLog] = useState<string>("まだ押されていません");
  const [tapCount, setTapCount] = useState<number>(0);

  // 3 秒後に結果を表示して、しるべの結果リアクションを確認するデモ
  const [resultPending, setResultPending] = useState(false);
  const [delayedResultVisible, setDelayedResultVisible] = useState(false);
  const resultTimerRef = useRef<number>(0);

  // 小さな必須フォームの確認用
  const [birthDate, setBirthDate] = useState("");
  const [originCity, setOriginCity] = useState("");
  const [formSaved, setFormSaved] = useState(false);

  useEffect(() => {
    return () => {
      if (resultTimerRef.current) {
        window.clearTimeout(resultTimerRef.current);
      }
    };
  }, []);

  const recordTap = (label: string) => {
    setTapCount((prev) => prev + 1);
    setTapLog(`「${label}」を押せました`);
  };

  const triggerDelayedResult = () => {
    if (resultTimerRef.current) window.clearTimeout(resultTimerRef.current);
    setDelayedResultVisible(false);
    setResultPending(true);
    resultTimerRef.current = window.setTimeout(() => {
      resultTimerRef.current = 0;
      setResultPending(false);
      setDelayedResultVisible(true);
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-[#faf7f3] text-[#1e2a5a]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-36 pt-8 sm:px-6 lg:px-8">
        {/* ヒーロー + コントロール */}
        <header className="rounded-2xl border border-[#c9a54a]/45 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5">
              <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-[#1e2a5a]">
                <span className="rounded bg-[#1e2a5a] px-2 py-0.5 text-[11px] text-[#f3d98b]">
                  試作デモ
                </span>
                <span>検索非公開（noindex / Disallow: /demo）</span>
              </p>
              <h1 className="text-xl font-bold tracking-tight text-[#1e2a5a] sm:text-2xl">
                しるべ 自由歩き回り＆自動案内デモ
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-700">
                画面全体を自律的に歩き回り、見出しやカードの上へ飛び移ったり、状況に合わせて指さし案内をしてくれる「しるべ」の確認ページです。キャラをタップすると今のページに合った案内が出ます。
              </p>
            </div>

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
                onClick={() =>
                  setGait((g) => (g === "rig" ? "shuffle" : "rig"))
                }
                aria-pressed={gait === "shuffle"}
                className="rounded-full border border-[#1e2a5a]/40 bg-white px-4 py-2 text-xs font-semibold text-[#1e2a5a] hover:bg-[#faf7f3]"
              >
                {gait === "rig"
                  ? "歩き方: 足を振る歩き（すり足に切り替え）"
                  : "歩き方: すり足（足を振る歩きに戻す）"}
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
              <button
                type="button"
                onClick={() => setFixSeed((v) => !v)}
                aria-pressed={fixSeed}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
                  fixSeed
                    ? "border-[#c9a54a] bg-[#f8f1dc] text-[#1e2a5a]"
                    : "border-[#1e2a5a]/30 bg-white text-[#1e2a5a] hover:bg-[#faf7f3]"
                }`}
              >
                {fixSeed
                  ? "ランダムの種を固定中（seed=42）"
                  : "ランダムの種を固定（デモ再現用）"}
              </button>
              <p
                className="text-xs text-slate-600"
                data-testid="shirube-demo-status"
              >
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
                床:{" "}
                <strong className="text-[#1e2a5a]">
                  {snapshot.perchId ?? "bottom"}
                </strong>
                {" / "}
                案内:{" "}
                <strong className="text-[#1e2a5a]">
                  {snapshot.tipId ?? "なし"}
                </strong>
                {" / "}
                OS: {osReduced ? "動きを減らす" : "通常"}
              </p>
            </div>
          </div>
        </header>

        {/* 今日の吉方位 結果カード（吉凶の緑は判定バッジにのみ使用） */}
        <section
          aria-label="今日の吉方位"
          data-shirube-perch="today-card"
          data-shirube-tip="today-lucky"
          className="rounded-2xl border border-[#c9a54a]/50 bg-white p-6 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-wider text-[#9c7926]">
                日盤のめやす
              </p>
              <h2 className="text-lg font-bold text-[#1e2a5a]">今日の吉方位</h2>
            </div>
            <span
              data-verdict="good"
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1 text-sm font-bold text-emerald-800"
            >
              南東：吉
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            午前中は南東、午後は東が穏やかに動きやすい目安です。詳しい時間帯ごとの吉凶は下の表からも確認できます。
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={triggerDelayedResult}
              disabled={resultPending}
              className="rounded-full border border-[#c9a54a] bg-[#f8f1dc] px-4 py-2 text-xs font-semibold text-[#1e2a5a] hover:bg-[#f3d98b]/60 disabled:opacity-60"
            >
              {resultPending
                ? "判定を計算中…（3 秒後に表示）"
                : "3 秒後に新しい判定結果を出す（結果リアクション確認）"}
            </button>
            {delayedResultVisible ? (
              <div
                data-shirube-result="delayed"
                data-verdict="good"
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-900"
              >
                試算結果：北西も吉（移動の候補に入れられます）
              </div>
            ) : null}
          </div>
        </section>

        {/* 先に結論セクション（見出しテキスト一致のデモ） */}
        <section
          aria-label="先に結論"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-base font-bold text-[#1e2a5a]">
            先に結論：まずは時期と方位の目安を並べてみる
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            引越し先を決めるときは、最初に「いつ動けそうか」をざっくり置き、その時期に使いやすい方位の地域から家賃相場を見比べると迷いにくくなります。
          </p>
        </section>

        {/* 動画プレースホルダ（外部 iframe は置かず data-shirube-tip="video" で再現） */}
        <section
          aria-label="解説動画プレースホルダ"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-base font-bold text-[#1e2a5a]">
            3 分でわかる方位の見方
          </h2>
          <div
            data-shirube-tip="video"
            data-shirube-perch="video-box"
            className="mt-3 flex aspect-video max-w-xl flex-col items-center justify-center rounded-xl border border-[#c9a54a]/50 bg-[#1e2a5a] p-6 text-center text-[#faf7f3]"
          >
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#c9a54a] bg-[#faf7f3]/10 text-lg text-[#f3d98b]">
              ▶
            </span>
            <p className="mt-3 text-sm font-semibold">
              解説動画プレースホルダ（外部埋め込みなし・デモ用）
            </p>
            <p className="mt-1 text-xs text-[#faf7f3]/75">
              data-shirube-tip=&quot;video&quot; に合わせてしるべが案内します
            </p>
          </div>
        </section>

        {/* 必須入力フォーム（未入力時の案内と、フォーカス中の回避確認） */}
        <section
          aria-label="条件入力デモ"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-base font-bold text-[#1e2a5a]">
            生年月日と出発地の入力（必須フォーム確認）
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            入力欄にフォーカスしている間は吹き出しや移動で邪魔をせず、未入力のまましばらく待つと「次はここを入力してください」と案内します。
          </p>
          <form
            className="mt-4 grid gap-4 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              setFormSaved(true);
              recordTap("フォームを保存");
            }}
          >
            <label className="flex flex-col gap-1 text-xs font-semibold text-[#1e2a5a]">
              生年月日（必須）
              <input
                type="date"
                required
                value={birthDate}
                onChange={(e) => {
                  setBirthDate(e.target.value);
                  setFormSaved(false);
                }}
                className="rounded-lg border border-slate-300 bg-[#faf7f3] px-3 py-2 text-sm text-[#1e2a5a]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-[#1e2a5a]">
              いま住んでいる地域（必須）
              <select
                required
                value={originCity}
                onChange={(e) => {
                  setOriginCity(e.target.value);
                  setFormSaved(false);
                }}
                className="rounded-lg border border-slate-300 bg-[#faf7f3] px-3 py-2 text-sm text-[#1e2a5a]"
              >
                <option value="">選択してください</option>
                <option value="tokyo">東京都</option>
                <option value="osaka">大阪府</option>
                <option value="fukuoka">福岡県</option>
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                data-primary-cta
                className="w-full rounded-full bg-[#1e2a5a] px-5 py-2.5 text-sm font-semibold text-[#f3d98b] hover:opacity-90"
              >
                条件を保存する
              </button>
            </div>
          </form>
          {formSaved ? (
            <p className="mt-2 text-xs text-slate-600">
              デモ上の入力状態を確認しました（外部送信は行いません）。
            </p>
          ) : null}
        </section>

        {/* 横幅のある本文カード（自動床検出の対象） */}
        <section
          aria-label="ダミー本文カード"
          className="grid gap-5 md:grid-cols-3"
        >
          {DUMMY_CARDS.map((card) => (
            <article
              key={card.id}
              data-shirube-perch={`card-${card.id}`}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-wider text-[#9c7926]">
                  {card.eyebrow}
                </p>
                <h3 className="text-base font-bold text-[#1e2a5a]">
                  {card.title}
                </h3>
                <p className="text-sm leading-relaxed text-slate-700">
                  {card.body}
                </p>
              </div>
              <div className="mt-5 border-t border-slate-100 pt-3">
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

        {/* 空状態ブロック（data-empty-state の確認） */}
        <section
          aria-label="保存した候補の空状態"
          data-empty-state
          className="rounded-2xl border border-dashed border-[#c9a54a]/70 bg-[#f8f1dc]/50 p-6 text-center"
        >
          <h2 className="text-base font-bold text-[#1e2a5a]">
            保存した候補（空状態のサンプル）
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            まだ保存した引越し候補はありません。気になる地域や日取りを見つけて追加できます。
          </p>
        </section>

        {/* すり足しるべの使いどころ（画面下以外に置く小物） */}
        <section
          aria-label="すり足しるべの使いどころ"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-base font-bold text-[#1e2a5a]">
            すり足しるべ（小物）の置き方の例
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">
            4
            コマのすり足で歩く小さなしるべです。カードの角・お知らせの帯・読み込み中の表示などに置けます。動きを減らす設定では
            1 コマ目で止まります。
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="flex items-end gap-3 rounded-xl border border-slate-200 bg-[#faf7f3] p-4">
              <ShirubeShuffle size={56} />
              <p className="text-sm leading-relaxed text-slate-700">
                カードの角で足踏み（その場で歩く）
              </p>
            </div>
            <div className="rounded-xl border border-[#c9a54a]/50 bg-[#f8f1dc] p-4">
              <p className="text-sm font-semibold text-[#1e2a5a]">
                お知らせの帯を行ったり来たり
              </p>
              <div className="mt-2 border-b border-[#c9a54a]/60">
                <ShirubeShuffle size={44} travel travelSeconds={16} />
              </div>
            </div>
            <div
              role="status"
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 p-4"
            >
              <ShirubeShuffle size={48} label="読み込み中" />
              <p className="text-sm text-slate-700">読み込み中…（例）</p>
            </div>
          </div>
        </section>

        {/* 下部の操作確認エリア */}
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
              className="rounded-full border border-slate-200 bg-[#faf7f3] px-3 py-1 text-xs font-medium text-[#1e2a5a]"
            >
              操作確認（{tapCount} 回）: {tapLog}
            </p>
          </div>
          <p className="mt-2 text-sm text-slate-700">
            ステージ全体は pointer-events: none
            のため、しるべ本体と吹き出し以外の場所にあるボタンやリンクはそのまま押せます。
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
        gait={gait}
        seed={fixSeed ? 42 : undefined}
        autoTipMinIntervalMs={tour ? 9000 : undefined}
        enterTipDelayMs={tour ? 2500 : undefined}
        forceReducedMotion={stopMotionToggle ? true : undefined}
        onStatusChange={setSnapshot}
      />
    </div>
  );
}
