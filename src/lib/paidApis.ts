/**
 * 有料の外部 API を一括で止めるサーバー側スイッチ。
 *
 * 既定は停止（オン）。キーがあっても呼ばない。再開するときだけ
 * `PAID_APIS_DISABLED=false` を置く。クライアントには渡さない。
 */
export const PAID_APIS_DISABLED_REASON = "paidApisDisabled" as const;

export const PAID_APIS_PAUSED_TEXT =
  "現在AI回答は停止しています。計算結果はこのまま確認できます。";

export function paidApisDisabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = Object.prototype.hasOwnProperty.call(env, "PAID_APIS_DISABLED")
    ? env.PAID_APIS_DISABLED
    : process.env.PAID_APIS_DISABLED;
  if (raw == null || raw === "") return true;
  return raw !== "false";
}

export function paidApisDeniedBody() {
  return {
    error: PAID_APIS_PAUSED_TEXT,
    reason: PAID_APIS_DISABLED_REASON,
  };
}
