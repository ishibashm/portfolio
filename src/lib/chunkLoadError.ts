/**
 * 「読み込むはずの塊（chunk）が無い」種類のエラーかどうか。
 *
 * ## なぜ要るか
 *
 * このサイトは master へマージするたびに Cloud Run へ出る。出るたびに
 * JavaScript の塊のファイル名（ハッシュ）が変わり、**前の版のファイルは
 * 消える。**
 *
 * すでにサイトを開いている人の画面は、前の版の名前を覚えている。その
 * まま別の頁へ進むと、消えたファイルを取りに行って 404 になる。React は
 * そこで例外を投げ、受け止める境界が無いと Next.js の既定の画面
 *
 *   Application error: a client-side exception has occurred
 *
 * が出る。英語の 1 行だけで、利用者にできることが何も書かれていない。
 * 実際に利用者から報告があった（2026-08-20 07:48 JST、「引越しの日取りを
 * 選ぶ」を開いたところ。直前 07:33 に #440 のデプロイが完了している）。
 *
 * ## 直し方の考え
 *
 * これは**壊れていない。古い名前を見ているだけ**なので、読み込み直せば
 * 直る。だから、この種類のエラーだけは自動で 1 回だけ再読み込みする。
 * 何度も繰り返さないよう、印を sessionStorage に置く。
 *
 * 判定は名前と文言の両方で見る。ブラウザとバンドラで文言が違うため。
 */

/** 塊の読み込み失敗を表す文言。ブラウザごとに違う。 */
const CHUNK_ERROR_PATTERNS = [
  /Loading chunk \S+ failed/i,
  /Loading CSS chunk \S+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
];

export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const name = (error as { name?: unknown }).name;
  if (name === "ChunkLoadError") return true;

  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") return false;

  return CHUNK_ERROR_PATTERNS.some((re) => re.test(message));
}

/** 自動の再読み込みを 1 回に留めるための印。 */
const RELOAD_FLAG = "chunk_reload_attempted";

/**
 * 塊の読み込み失敗なら 1 回だけ再読み込みする。したら true。
 *
 * **2 回目はしない。**再読み込みしても直らない状況（配信側が壊れて
 * いる、通信が切れている）で無限に往復すると、利用者は何も読めない
 * まま端末を温め続けることになる。1 回で直らなければ、画面に出して
 * 人が決められるようにする。
 */
export function reloadOnceForChunkError(error: unknown): boolean {
  if (typeof window === "undefined") return false;
  if (!isChunkLoadError(error)) return false;

  try {
    if (window.sessionStorage.getItem(RELOAD_FLAG)) return false;
    window.sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    // sessionStorage が使えない（プライベート閲覧など）。
    // 印を残せないなら、繰り返しを防げないので再読み込みはしない。
    return false;
  }

  window.location.reload();
  return true;
}

/** 再読み込みで直ったあとに印を消す。次のデプロイでまた効くように。 */
export function clearChunkReloadFlag(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    // 消せなくても実害は無い（次のセッションで消える）。
  }
}
