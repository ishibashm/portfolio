/**
 * 画面に出すエラー文言。
 *
 * 通信が落ちたときに setError(err.message) をそのまま渡していたため、
 * ブラウザが返す "Failed to fetch" が赤帯に出ていた（移住先を比べる画面で実測）。
 * 何が起きたのか、次に何をすればよいのかが読み手に伝わらない。
 *
 * サーバが日本語のメッセージを返したときはそれを尊重し、ブラウザ由来の
 * 英語や見慣れない文字列は、こちらで書いた日本語に置き換える。
 */

/** ブラウザや fetch が返す、利用者には意味の無い文言。 */
const NETWORK_ERRORS =
  /failed to fetch|networkerror|load failed|network request failed|the user aborted|aborterror|err_(internet|network|connection)/i;

const NETWORK_MESSAGE =
  "通信に失敗しました。電波や接続を確認して、もう一度お試しください。";

/** 日本語（ひらがな・カタカナ・漢字）が含まれるか。 */
function hasJapanese(text: string): boolean {
  return /[぀-ヿ一-龯]/.test(text);
}

export function toUserMessage(
  err: unknown,
  fallback = "データの取得に失敗しました。時間をおいて、もう一度お試しください。",
): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";

  const text = raw.trim();
  if (text === "") return fallback;
  if (NETWORK_ERRORS.test(text)) return NETWORK_MESSAGE;
  // サーバが日本語で説明を返しているならそれが一番具体的。
  if (hasJapanese(text)) return text;
  return fallback;
}

/**
 * ログ（console / ファイル）に出す一行。**画面には出さない。**
 *
 * `catch (e: any) { console.error(e.message) }` が各所にあり、これが残り
 * `any` の 2 割を占めていた。注釈を外すと `e` は `unknown` になって
 * `.message` が読めなくなるが、キャストで逃げるのは避けたいので、
 * 「Error なら message、そうでなければ文字列化」をここに 1 つ置く。
 *
 * 挙動の違いは 1 点だけ。Error 以外が投げられたとき、これまでログに
 * `undefined` と出ていたのが実際の値になる。画面の文言は変わらない
 * （そちらは上の `toUserMessage`）。
 */
export function toLogMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
