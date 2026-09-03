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

/**
 * 絞り込みの見方。
 *
 * ## 3 つの層の組み合わせで表す
 *
 * 中身は独立した 3 つの層で、id はその**組み合わせの名前**でしかない。
 *
 * - `kigaku` … 本命星（本命殺・本命的殺・本命星との相生）
 * - `env`    … 環境方位（五黄殺・暗剣殺・破・ノード）
 * - `bazi`   … 天中殺（空亡。方位の禁忌と期間の禁忌の両方）
 *
 * 以前は 4 つの排他モードしか無く、**本命星と環境方位を一緒に見ることが
 * できなかった**（利用者の報告）。組み合わせを足して、どの 2 つでも
 * 併用できるようにした。3 つ全部は `composite`（総合判定）と同じもの
 * なので、そちらに寄せてある。
 *
 * ## id の付け方
 *
 * `kigaku` / `env` / `bazi` を**部分文字列として含める**。
 * `SolarTimeClock` が `directionFilterMode.includes("kigaku")` の形で
 * 層を判定しているので、この規則を崩すとあちらが黙って外れる。
 */
export type DirectionFilterMode =
  | "composite"
  | "personal_kigaku"
  | "personal_bazi"
  | "environmental"
  | "personal_kigaku_environmental"
  | "personal_kigaku_bazi"
  | "environmental_bazi";

/** どの層を見るか。3 つとも true は composite と同じ意味。 */
export interface DirectionFilterLayers {
  /** 本命星（本命殺・本命的殺・相生） */
  honmei: boolean;
  /** 環境方位（五黄殺・暗剣殺・破・ノード） */
  environmental: boolean;
  /** 天中殺（空亡） */
  tenchusatsu: boolean;
}

const LAYERS: Record<DirectionFilterMode, DirectionFilterLayers> = {
  composite: { honmei: true, environmental: true, tenchusatsu: true },
  personal_kigaku: { honmei: true, environmental: false, tenchusatsu: false },
  environmental: { honmei: false, environmental: true, tenchusatsu: false },
  personal_bazi: { honmei: false, environmental: false, tenchusatsu: true },
  personal_kigaku_environmental: {
    honmei: true,
    environmental: true,
    tenchusatsu: false,
  },
  personal_kigaku_bazi: {
    honmei: true,
    environmental: false,
    tenchusatsu: true,
  },
  environmental_bazi: {
    honmei: false,
    environmental: true,
    tenchusatsu: true,
  },
};

/** その見方が、どの層を見るか。 */
export function filterLayersOf(
  mode: DirectionFilterMode,
): DirectionFilterLayers {
  return LAYERS[mode] ?? LAYERS.composite;
}

/** 見方の一覧（画面の並び順）。 */
export const DIRECTION_FILTER_MODES: readonly DirectionFilterMode[] = [
  "composite",
  "personal_kigaku",
  "environmental",
  "personal_bazi",
  "personal_kigaku_environmental",
  "personal_kigaku_bazi",
  "environmental_bazi",
] as const;

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
    case "personal_kigaku_environmental":
    case "personal_kigaku_bazi":
    case "environmental_bazi":
      return raw;
    default:
      return "composite";
  }
}
