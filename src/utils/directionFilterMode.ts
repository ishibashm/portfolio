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
 * - `env`    … 環境方位（五黄殺・暗剣殺・破）
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
  /** 環境方位（五黄殺・暗剣殺・破） */
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

/**
 * 見方の呼び名。**表はここ 1 つ。**
 *
 * 目的地タブの観点ボタンと、畳んだときの 1 行（「観点: 本命星＋環境方位」）
 * で同じ言葉を使う。MetaphysicalConfigBar は別の表を持っていて英語の
 * 併記（"総合 (ALL)" など）が残っている。あちらを寄せるのは別の PR。
 */
export const DIRECTION_FILTER_MODE_LABELS: Record<DirectionFilterMode, string> =
  {
    composite: "総合判定",
    personal_kigaku: "本命星のみ",
    environmental: "環境方位のみ",
    personal_bazi: "天中殺のみ",
    personal_kigaku_environmental: "本命星＋環境方位",
    personal_kigaku_bazi: "本命星＋天中殺",
    environmental_bazi: "環境方位＋天中殺",
  };

export function directionFilterModeLabel(mode: DirectionFilterMode): string {
  return DIRECTION_FILTER_MODE_LABELS[mode];
}

/**
 * ダッシュボード（SolarTimeClock）が state に持つ値。
 *
 * 見方（DirectionFilterMode）に加えて、**表示だけの重ね札** 2 つを同じ
 * state に持っている（大吉を強調する／大凶を灰色にする。層は総合判定の
 * まま通る。SolarTimeClock の filterVectors の註）。
 *
 * 以前は `string` で、観点のボタンが古い id（`kigaku_env` など）を書いても
 * tsc が何も言わなかった（#1337）。ここで名前を付けて狭める。
 */
export type DashboardFilterMode =
  | DirectionFilterMode
  | "optimal_only"
  | "exclude_noise";

/**
 * 観点のボタンが以前書いていた古い id。#1337 で正規の名前に直したが、
 * **クラウドに保存された値はそのまま残る。**読み込みで正規の名前に写す。
 *
 * 写すのはダッシュボードの読み込み口だけ。`parseDirectionFilterMode`
 * （他の頁・API）は知らない値を総合判定に倒す決めごとのまま
 * （MetaphysicalConfigBar のテストが固定している）。ダッシュボードが
 * 一度読んで保存し直せば、他の頁も正規の名前を読めるようになる。
 */
const LEGACY_DASHBOARD_IDS: Record<string, DirectionFilterMode> = {
  kigaku_env: "personal_kigaku_environmental",
  kigaku_bazi: "personal_kigaku_bazi",
  bazi_env: "environmental_bazi",
};

/**
 * 素の文字列を DashboardFilterMode に落とす。
 *
 * 7 つの見方と重ね札 2 つはそのまま。古い id は正規の名前に写す。
 * それ以外（壊れた保存値）は parseDirectionFilterMode と同じく
 * 総合判定に倒す。
 */
export function parseDashboardFilterMode(
  raw: string | null | undefined,
): DashboardFilterMode {
  if (raw === "optimal_only" || raw === "exclude_noise") return raw;
  /* `in` は prototype まで見る（"toString" が写される）。own だけ */
  if (raw && Object.hasOwn(LEGACY_DASHBOARD_IDS, raw))
    return LEGACY_DASHBOARD_IDS[raw];
  return parseDirectionFilterMode(raw);
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
