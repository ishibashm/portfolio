/**
 * 凶方位の重さの、サイト全体でただ一つの定義。
 *
 * 2026-08 の監査で、凶の「重さの順序」と「絶対に避ける集合」が
 * 4 箇所でばらばらに定義されていた。
 *
 *   ephemerisEngine の合成      … {五黄殺,暗剣殺,破} を絶対格、
 *                                  次いで 天中殺方位 > 本命殺 > 的殺 > …
 *   directionStatus.PRIORITY    … 破を本命殺・的殺・天中殺方位より軽く扱う
 *                                  （エンジンと逆）
 *   arbitrageHelpers の大凶判定 … 五大凶殺 {五黄殺,暗剣殺,破,本命殺,的殺}
 *   auspiciousDays の X 段階    … 破が抜けた {五黄殺,暗剣殺,本命殺,的殺}
 *
 * 同じ日・同じ方位が、地図では「大凶」、ヒートマップの組み合わせ表示では
 * 「本命殺」、時期スクリーニングでは「次善の候補」になり得る状態だった。
 * 以後、順序と集合はこのファイルから引く。ここを変えれば全部が揃って変わる。
 *
 * 基準は古典の五大凶殺に置く。
 *
 *   五大凶殺 = 五黄殺・暗剣殺・歳破(月破/日破)・本命殺・本命的殺
 *
 * これらは移転で妥協しない集合であり、候補として提示しない。
 * 天中殺は方位ではなく「期間」の禁忌なので、この表とは別に
 * tenchusatsuPolicy が扱う（NOISE_VOID はその方位版で、二次凶に置く）。
 */

/** 絶対に避ける凶（五大凶殺）。候補・次善として決して提示しない */
export const FIVE_FATAL_NOISES: readonly string[] = [
  "NOISE_GOU", // 五黄殺
  "NOISE_ANKEN", // 暗剣殺
  "NOISE_HA", // 歳破・月破・日破
  "NOISE_HONMEI", // 本命殺
  "NOISE_TEKI", // 本命的殺
];

/**
 * 凶の重さの順序。複数の凶が重なった方位を 1 語に畳むときは
 * 必ずこの順で先勝ちにする。五大凶殺が常に先頭に来るので、
 * 致命的な凶が二次凶のラベルに隠れることがない。
 */
export const NOISE_PRIORITY: readonly string[] = [
  "NOISE_GOU",
  "NOISE_ANKEN",
  "NOISE_HA",
  "NOISE_HONMEI",
  "NOISE_TEKI",
  "NOISE_VOID", // 天中殺方位（空亡の支の方位）
  "NOISE_GETSUMEI", // 月命殺
  "NOISE_GETSUTEKI", // 月命的殺
  "NOISE_NODE", // 羅睺・計都（月の交点）
];

/**
 * 凶かどうか。重さは問わない。
 *
 * エンジンの状態は接頭辞で凶を表す（NOISE_GOU / NOISE_VOID …）。
 * この判定は `auspiciousDays.isInauspicious` が持っていたが、あちらは
 * 判定エンジンを**値として** import しているので、画面から呼ぶと
 * エンジンが丸ごとクライアントのバンドルに乗る（#177〜#179 で重い依存を
 * 遅延させた経緯がある）。凶の定義はもともとこのファイルの役目で、
 * ここは import が 1 つも無い。判定側はこれを呼ぶだけにする。
 */
export function isNoise(status: string | undefined): boolean {
  return !!status && status.startsWith("NOISE");
}

export function isFatalNoise(status: string | undefined): boolean {
  return !!status && FIVE_FATAL_NOISES.includes(status);
}

/**
 * 候補の中で最も重い凶を返す。凶が無ければ null。
 * 優先表に無い NOISE_* は最も軽い扱いだが、名前は保って返す。
 */
export function worstNoise(statuses: (string | undefined)[]): string | null {
  const valid = statuses.filter(Boolean) as string[];
  for (const p of NOISE_PRIORITY) {
    if (valid.includes(p)) return p;
  }
  return valid.find((s) => s.startsWith("NOISE")) ?? null;
}
