/**
 * この端末で WebGL が使えるか。立体の部品（三盤の方位盤・八宅の間取り・
 * 羅盤・地球儀）が、使えないときに平面の絵へ切り替えるために読む。
 *
 * 葉に置く。立体の部品から引くと、平面しか出さない画面まで three.js の
 * 部品を読むことになる。
 */
export function supportsWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
