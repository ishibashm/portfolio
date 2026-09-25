/**
 * 移動先が次の移動の起点（太極）になるかの規則。
 *
 * 「引越し先に 75 日以上住むと、そこが新しい拠点になる」。75 日に満たない
 * 移動は、次の移動も元の起点から測る。**目的が長期移住（MIGRATION）の
 * ときだけ。**旅行（TRAVEL）は何日いても起点を動かさない。
 *
 * 以前はシミュレータの頁に `purpose === "MIGRATION" && stayDuration >= 75`
 * と直に書いてあり、記事（does-a-lucky-move-cancel-an-unlucky-move・
 * guideContent）の「75 日」と突き合わせる口が無かった。ここに置いて
 * 記事の主張を検査で固定する（blogLuckyMoveCancelClaims）。
 *
 * 日数（45・60・75・90 日）には流派による説がある。このサイトは 75 日。
 */
export const BASE_STAY_DAYS = 75;

export function baseMovesAfter(purpose: string, stayDays: number): boolean {
  return purpose === "MIGRATION" && stayDays >= BASE_STAY_DAYS;
}
