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

/**
 * API の応答本文に入れるエラー文言。
 *
 * `catch (error: any)` で `{ error: error.message || "既定の文言" }` と
 * 書いていたものの置き換え。結果は同じで、
 *
 *   Error（message あり）  その message
 *   Error（message が空）  既定の文言
 *   Error 以外            既定の文言
 *
 * ログ用の `toLogMessage` と分けてあるのは、応答に素の値を混ぜないため。
 * `toLogMessage(err) || 既定` にすると、Error 以外が投げられたときに
 * `"[object Object]"` が応答本文に出てしまう。原因を追うための値は
 * `console.error` の側に残す（各ルートで元の値をそのまま渡している）。
 *
 * 画面に出す文言を作る `toUserMessage` とも別。こちらは応答であって、
 * そのまま利用者に見せると決まっているわけではない。
 */
export function toResponseMessage(err: unknown, fallback: string): string {
  return (err instanceof Error && err.message) || fallback;
}

/**
 * 投げられたものに付いている `code` を取り出す。
 *
 * Node の fs は `ENOENT`、Prisma は `P2037` のようにコードで種類を伝えてくる。
 * これを見て分岐している箇所が `catch (e: any)` のまま残っていた。
 * `code` は Error の標準プロパティではないので `instanceof Error` では
 * 取れず、かといってキャストで押し通すのは避けたい。
 *
 * 文字列の `code` を持っていればそれを返し、無ければ undefined。
 * `e.code === "ENOENT"` と書いていたときと同じ結果になる（`code` を
 * 持たないものは undefined で、どの比較にも一致しない）。
 */
export function errorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) {
    return undefined;
  }
  const code = err.code;
  return typeof code === "string" ? code : undefined;
}
