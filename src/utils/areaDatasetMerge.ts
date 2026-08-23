/**
 * 一度公開した市区町村の URL を消さないための併合。
 *
 * ## 何が起きていたか
 *
 * `/houi/area/[code]` は `src/data/areaDirections.json` を
 * `generateStaticParams` の入力にしていて、`dynamicParams = false`。
 * つまり **JSON に無い code はビルド後 404 を返す。**
 *
 * その JSON は毎晩作り直され、掲載が `MIN_ROWS`（30 件）に満たない
 * 市区町村は落とされる。賃貸の掲載は日々増減するので、境目にいる
 * 市区町村が**出たり入ったりする。**実測（2026-08）:
 *
 *   08-16  910 件   07322（福島県安達郡大玉村・掲載 32 件）無し
 *   08-17 1022 件   有り
 *   08-18 1049 件   **無し** ← Google がこの日 404 を踏んだ
 *   08-19 1056 件   無し
 *   08-20 1062 件   有り
 *
 * 収録数そのものが 910〜1068 で毎日 100 件以上ぶれている。**あった URL が
 * 消えてまた現れる**ので、検索エンジンから見ると信頼できない。利用者が
 * 共有した URL も、その日次第で 404 になる。
 *
 * ## どう直すか
 *
 * **一度載せた code は落とさない。**閾値を割った市区町村は、前回の数字を
 * そのまま残す。ただし**いつ時点の数字なのかを持たせる**（`asOf`）。
 * 数字が古いことを黙って隠すと、更新されていない相場を現在の相場として
 * 出すことになる。
 *
 * 閾値を下げて解決しないのは、**閾値をどこに置いても境目は必ずできる**から。
 * 30 を 20 にすれば 20 の周りで同じことが起きる。
 */

/** `areaDirections.json` の 1 市区町村ぶん。 */
export interface AreaEntry {
  code: string;
  pref: string;
  city: string;
  full: string;
  lat: number;
  lon: number;
  count: number;
  sqmRent: number;
  medianRent: number;
  /**
   * この数字を集計した日（YYYY-MM-DD）。
   *
   * 今回の集計に入った市区町村は今日の日付。閾値を割って前回の数字を
   * 引き継いだ市区町村は、**引き継いだ元の日付のまま**。画面はこれを見て
   * 「いつ時点か」を出せる。
   */
  asOf: string;
}

export interface MergeResult {
  areas: AreaEntry[];
  /** 今回の集計に入った数。 */
  fresh: number;
  /** 閾値を割って前回から引き継いだ数。 */
  carried: number;
  /** 引き継いだ code（ログに出して、増え続けていないか見る）。 */
  carriedCodes: string[];
}

/**
 * 今回の集計と前回の JSON を併合する。
 *
 * 今回に居る市区町村は今回の数字で上書きし、今回に居ない市区町村は
 * 前回の数字をそのまま残す。**消さない。**
 *
 * 並びは今回の集計と同じ「掲載の多い順」。引き継ぎ分は数字が古いので
 * 後ろに回す——先頭に古い数字が混ざると、一覧として読みにくい。
 */
export function mergeAreaDataset(
  fresh: Omit<AreaEntry, "asOf">[],
  previous: AreaEntry[],
  today: string,
): MergeResult {
  const freshByCode = new Map(fresh.map((a) => [a.code, a]));
  const merged: AreaEntry[] = fresh.map((a) => ({ ...a, asOf: today }));

  const carriedCodes: string[] = [];
  for (const old of previous) {
    if (freshByCode.has(old.code)) continue;
    /*
      前回の日付をそのまま残す。ここで today を入れると、更新していない
      数字が「今日の集計」として出てしまう。
    */
    merged.push({ ...old, asOf: old.asOf ?? "" });
    carriedCodes.push(old.code);
  }

  merged.sort((a, b) => {
    /* 引き継ぎ（古い数字）は後ろ。同じ鮮度なら掲載の多い順。 */
    const aStale = a.asOf !== today ? 1 : 0;
    const bStale = b.asOf !== today ? 1 : 0;
    return aStale - bStale || b.count - a.count;
  });

  return {
    areas: merged,
    fresh: fresh.length,
    carried: carriedCodes.length,
    carriedCodes,
  };
}

/** その市区町村の数字が今回の集計のものか。 */
export function isFresh(entry: AreaEntry, today: string): boolean {
  return entry.asOf === today;
}

/**
 * 前回の JSON を読む。無い・壊れているときは空で返す。
 *
 * 空で返すのは、**初回のビルドで落ちないため。**ただし空のまま書き出すと
 * 引き継ぎが効かないので、呼ぶ側は「前回が空だった」ことをログに出すこと。
 */
export function parsePreviousAreas(raw: string | null): AreaEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as {
      areas?: unknown;
      generatedAt?: unknown;
    };
    if (!Array.isArray(parsed.areas)) return [];
    /*
      併合を入れる前に書き出された JSON には asOf が無い。そのままだと
      引き継いだ行の asOf が空文字になり、画面が `new Date("")` を
      掴んで「Invalid Date」を出す（実ファイルで再現した）。

      その行がいつの数字かは、**ファイルの generatedAt が答え**。
      併合前は全行が同じ日に集計されていたので、これで正しい。
    */
    const fileDate =
      typeof parsed.generatedAt === "string"
        ? parsed.generatedAt.slice(0, 10)
        : "";
    return parsed.areas
      .filter(
        (a): a is AreaEntry => !!a && typeof (a as AreaEntry).code === "string",
      )
      .map((a) => (a.asOf ? a : { ...a, asOf: fileDate }));
  } catch {
    return [];
  }
}
