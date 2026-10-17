"use client";
import { useEffect, useState } from "react";
export default function AgentStatus() {
  const [state, setState] = useState<{
    paused: "billing" | null;
    lastBillingAt: string | null;
  }>();
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/ai-status", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(setState)
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, []);
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 space-y-2 text-sm">
      <h2 className="font-bold">AI回答の状態</h2>
      <p role="status">
        {error
          ? "状態を取得できませんでした。ページを再読み込みしてください。"
          : !state
            ? "確認しています…"
            : state.paused === "billing"
              ? "利用残高切れ（402 / billing）による停止を観測しました。"
              : "利用残高切れによる停止は現在観測されていません。"}
      </p>
      <p>
        このインスタンスで観測した最後の時刻（JST）：
        {state?.lastBillingAt
          ? new Intl.DateTimeFormat("ja-JP", {
              timeZone: "Asia/Tokyo",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hourCycle: "h23",
            }).format(new Date(state.lastBillingAt))
          : state
            ? "未観測"
            : "不明"}
      </p>
      <p>
        Cloud
        Runの複数インスタンス間では共有されず、再起動で記録は消えます。残高補充後、次のAI接続の成功を観測すると停止表示を解除します。全体の稼働状況は保証しません。
      </p>
      <ol className="space-y-1">
        <li>
          (1){" "}
          <a className="underline" href="https://aistudio.google.com/billing">
            https://aistudio.google.com/billing
          </a>{" "}
          を、APIキーを作った Google アカウントで開く
        </li>
        <li>(2) 「Buy credits」で最低額（通常 $5）を購入</li>
        <li>
          (3) ページを再読み込みして残高を確認（デプロイやキー変更は不要）
        </li>
        <li>
          (4) 止まりを防ぐなら auto-reload
          を設定（例：残高が$2を切ったら$5追加）
        </li>
      </ol>
      <p>Google AI Pro/Ultra の月次クレジットも、最初に$5入金が必要。</p>
    </section>
  );
}
