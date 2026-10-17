/**
 * ログイン方法の切り替え。メールのログイン（マジックリンク）は、
 * Supabase 側で送信元（Resend の SMTP）を設定してから
 * `EMAIL_LOGIN_ENABLED=true` を入れて初めて出す。入れていなければ
 * 従来どおり Google だけ。
 */
export function emailLoginEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.EMAIL_LOGIN_ENABLED === "true";
}

export const EMAIL_LOGIN_TEXT = {
  label: "メールアドレスでログイン",
  submit: "ログイン用のリンクを送る",
  sent: "ログイン用のリンクを送りました。このブラウザでメールのリンクを開いてください。届かないときは迷惑メールのフォルダもご確認ください。",
  invalid: "メールアドレスを確かめてください。",
} as const;

/** 形だけの確認（届くかどうかは送ってみないと分からない）。 */
export function looksLikeEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
