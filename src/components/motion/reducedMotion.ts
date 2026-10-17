/** 利用者が動きを減らす設定にしているか。判定できない環境では減らす側に倒す。 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
