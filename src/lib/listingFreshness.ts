import { LIVE_LISTING_MAX_AGE_DAYS } from "@/lib/rentalListingSql";

/**
 * 掲載が「まだ増えているのか、もう増えないのか」を、鮮度から言い当てる。
 *
 * ## なぜ要るか
 *
 * 賃貸の巡回は 2026-09-13 に止めた（規約。`docs/improvement-backlog.md`
 * 29 節）。**止めたことは画面のどこにも書いていない。**物件検索は
 * 「物件データ最終取込」の日時を出しているが、それが**古いことの意味**は
 * 書いていない。日付だけ見せられても、利用者には「今日は取り込みが
 * 遅れているのかな」としか読めない。
 *
 * さらに悪いことに、掲載の条件（`LIVE_LISTING_SQL`）は
 *
 *     last_seen_at > now() - interval '30 days'
 *
 * なので、**巡回を止めた日から 30 日で件数が 0 になる。**その途中、
 * 件数は毎日減っていく。画面は理由を言わない（`staleHidden` は絞り込みで
 * 落ちた分の数であって、巡回停止の説明ではない）。
 *
 * ここはその状態を**言葉にできる形**にするだけ。判定も絞り込みも変えない。
 *
 * ## 「止まっている」を日付で決めない
 *
 * 「9 月 13 日に止めた」と書き込むと、巡回を再開したときに嘘になる。
 * 見るのは**取り込みの日時と今の差**だけ。再開すれば案内は自然に消える。
 */

/**
 * 何日ぶん取り込みが無ければ「止まっている」と見なすか。
 *
 * 巡回は日次（cron `17 19 * * *`）だった。GitHub の混雑で run の起動が
 * 数時間ずれることがあり、実測で 8/28 の cron が 8/29 に回っている
 * （`scrape-rentals.yml` のコメント）。1 日では誤検知するので 3 日取る。
 */
export const LISTING_STALE_AFTER_DAYS = 3;

export type ListingFreshness =
  /** 取り込みの日時が分からない（件数 0 の応答など）。何も言わない。 */
  | { kind: "unknown" }
  /** 巡回が続いている。何も言わない。 */
  | { kind: "fresh"; daysSince: number }
  /**
   * 取り込みが止まっている。掲載はもう増えず、古いものから消えていく。
   * `daysUntilEmpty` は最後の 1 件が掲載条件から外れるまでの日数。
   */
  | { kind: "stopped"; daysSince: number; daysUntilEmpty: number }
  /** 30 日を越えた。掲載条件に当たる行はもう無い。 */
  | { kind: "empty"; daysSince: number };

/**
 * 経過日数。**暦の日付ではなく経過時間で数える。**日付で数えると
 * タイムゾーンの取り方で 1 日ずれる（CLAUDE.md 3 節）。ここで欲しいのは
 * 「何日ぶん取り込まれていないか」なので、差を 24 時間で割るのが素直。
 */
function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export function describeListingFreshness(
  /** `metadata.dataUpdatedAt`（ISO 文字列）。 */
  dataUpdatedAt: string | null | undefined,
  now: Date = new Date(),
): ListingFreshness {
  if (!dataUpdatedAt) return { kind: "unknown" };
  const updated = new Date(dataUpdatedAt);
  if (Number.isNaN(updated.getTime())) return { kind: "unknown" };

  /* 未来の日時は「今」として扱う。時計のずれで負の日数を出さない */
  const daysSince = Math.max(0, daysBetween(updated, now));

  if (daysSince < LISTING_STALE_AFTER_DAYS) return { kind: "fresh", daysSince };
  if (daysSince >= LIVE_LISTING_MAX_AGE_DAYS)
    return { kind: "empty", daysSince };
  return {
    kind: "stopped",
    daysSince,
    daysUntilEmpty: LIVE_LISTING_MAX_AGE_DAYS - daysSince,
  };
}

/**
 * 画面に出す文言。**断りは「止めた」ではなく「増えていない」から書く。**
 * 理由（規約）は別の行で短く添える。ここでは事実と、これからどうなるかだけ。
 */
export function listingFreshnessMessage(f: ListingFreshness): string | null {
  switch (f.kind) {
    case "unknown":
    case "fresh":
      return null;
    case "stopped":
      return `掲載の取り込みは ${f.daysSince} 日前で止まっています。新しい部屋は増えず、掲載が終わった部屋から順に消えていきます（あと ${f.daysUntilEmpty} 日ほどで 0 件になります）。`;
    case "empty":
      return `掲載の取り込みは ${f.daysSince} 日前で止まっており、${LIVE_LISTING_MAX_AGE_DAYS} 日を過ぎた掲載は表示していません。方位の判定と地図は今までどおり使えます。`;
  }
}

/**
 * 掲載から作った**静止した数字**に添える断り（市区町村ページ・県ページ）。
 *
 * ## 物件検索とは事情が違う
 *
 * 物件検索は DB を毎回引くので、30 日の窓から外れて**件数が 0 に向かって
 * 減っていく**。こちらが読むのは `areaDirections.json`（`build_area_dataset`
 * が焼いた静的ファイル）で、**そのスクリプトは `scrape-rentals.yml` の中に
 * しか無い。**巡回を止めた時点で焼き直されなくなったので、0 件にはならず
 * **その日の値のまま凍結している。**
 *
 * 頁は「集計日: 2026/09/13」を出しているが、日付だけでは「取り込みが
 * 遅れているのかな」としか読めない。**もう動かない**ことを書く。
 *
 * ## 日数を出さない
 *
 * 市区町村ページは静的生成（`generateStaticParams`）なので、ここで
 * `new Date()` を取ると**ビルド時刻**になる。「3 日前」と焼かれた頁が
 * 3 か月後も「3 日前」と言い続ける。**絶対の日付は頁が既に出している**
 * ので、ここでは日数に触れない。
 *
 * 判定そのものはビルド時の比較で正しく働く。巡回を再開すれば
 * `build_area_dataset` が回って `asOf` が進み、次のデプロイでこの断りは
 * 消える。
 */
export function listingSnapshotNote(
  /** その市区町村の集計日（ISO 文字列）。 */
  asOf: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const f = describeListingFreshness(asOf, now);
  if (f.kind === "unknown" || f.kind === "fresh") return null;
  return "掲載の取り込みは、提供元の規約に従って止めています。この相場と一覧はその時点のもので、以降は更新していません。方位・距離・公的な統計は今までどおりです。";
}
