/**
 * 絞り込みの見方（DirectionFilterMode）と行動の目的（ActionIntent）。
 *
 * ephemerisEngine.ts から切り出した葉。中身は変えていない。
 *
 * ## なぜ別ファイルか
 *
 * これらは素の文字列を union に落とすだけの小さな関数だが、
 * ephemerisEngine に置いてあると、**値として import した時点で
 * 暦エンジン一式（lunar-javascript・astronomy-engine）が client の
 * バンドルに乗る。**#553 で DestinationMapPanel がキャストを残した
 * のはこのため（parseActionIntent を呼ぶとエンジンが乗る）。
 *
 * 物件検索（/relocation/arbitrage）は parseDirectionFilterMode を
 * 設定の読み込みで使っていて、それだけで初回読み込みにエンジンが
 * 乗っていた（docs/improvement-backlog.md 17 節）。
 *
 * ephemerisEngine は同じものを再輸出するので、既存の import 先は
 * そのまま動く。定義は 1 か所のまま。
 */
export type ActionIntent = "DEFAULT" | "REST" | "BUSINESS" | "MIGRATION";

export type DirectionFilterMode =
  | "composite"
  | "personal_kigaku"
  | "personal_bazi"
  | "environmental";

/**
 * 素の文字列を ActionIntent に落とす。
 *
 * 無いときは whenAbsent（既定 DEFAULT）、知らない値は DEFAULT。
 */
export function parseActionIntent(
  raw: string | null | undefined,
  whenAbsent: ActionIntent = "DEFAULT",
): ActionIntent {
  if (raw === null || raw === undefined || raw === "") return whenAbsent;
  switch (raw) {
    case "DEFAULT":
    case "REST":
    case "BUSINESS":
    case "MIGRATION":
      return raw;
    default:
      return "DEFAULT";
  }
}

/**
 * 素の文字列を DirectionFilterMode に落とす。
 *
 * **知らない値は `composite`（絞り込みなし）に落とす。**
 *
 * 直す前は文字列をそのまま流していた。`filterCollisionByMode` は
 * composite / personal_kigaku / personal_bazi を名前で見て、**残り全部を
 * environmental として扱う**ので、壊れた値は environmental になっていた。
 * 値が無いときは composite なのに、壊れた値だと environmental になる、
 * という筋の通らない状態だった。
 *
 * `composite` に寄せるのは、**値が無いときと同じ扱いにするため。**
 * 読めない指定は「指定されなかった」と同じであるべきで、勝手に別の
 * 見方（environmental）へ倒すのは利用者の意図と関係がない。
 */
export function parseDirectionFilterMode(
  raw: string | null | undefined,
): DirectionFilterMode {
  switch (raw) {
    case "composite":
    case "personal_kigaku":
    case "personal_bazi":
    case "environmental":
      return raw;
    default:
      return "composite";
  }
}
