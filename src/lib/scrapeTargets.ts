/**
 * スクレイピング対象の都道府県。ここが唯一の情報源。
 *
 * 同じリストが以前は 5 箇所に散っていた。
 *
 *   scripts/nifty_extractor.ts       取りに行く県
 *   scripts/purge_rental_properties.ts  範囲外として「消す」県
 *   scripts/build_area_dataset.ts    エリアページを作る県
 *   src/app/relocation/arbitrage/page.tsx  スキャナーの県プリセット
 *   src/lib/guideContent.ts          利用ガイドの説明文
 *
 * 2 番目が他とずれると、取り込んだ行がその晩のパージで消える。実際に岐阜が
 * この形で 0 件になっている。手で揃える運用は既に一度失敗しているので、
 * すべてこのモジュールから引く。
 *
 * 依存を持たせないこと。GitHub Actions の plan ジョブが npm ci を挟まずに
 * `npx tsx` で読むため、import を足すとそこが壊れる。
 */

/**
 * 巡回の階層。
 *
 * metro    在庫が多く検索需要も高い。毎日回す。
 * regional 在庫が少ない。数日に 1 回に間引いて、その分を metro に回す。
 */
export type ScrapeTier = "metro" | "regional";

export interface ScrapeTarget {
  /** nifty の URL に入るローマ字。/rent/{slug}/ */
  slug: string;
  /** DB の住所文字列と突き合わせる日本語表記。パージの判定に使う */
  name: string;
  /** スキャナーで県を選んだときに地図を寄せる代表座標 */
  lat: number;
  lon: number;
  tier: ScrapeTier;
  /** 1 回の実行でこの県に割く分数 */
  budgetMin: number;
  /** 何日に 1 回回すか。1 なら毎日 */
  everyNDays: number;
  /**
   * 巡回日の位相。everyNDays が同じ県を同じ日に固めないためにずらす。
   * 0 <= offsetDays < everyNDays であること。
   */
  offsetDays: number;
}

/**
 * 予算の根拠。
 *
 * 2026-08-07 の実測で、兵庫県は 63,309 件を 100 分/日で 7 日以内に一巡している。
 * ここから毎分およそ 90 件。県の在庫を Q 件とすると、7 日周期に必要な分数は
 *
 *   budgetMin ≒ Q / 7 / 90
 *
 * 既存 12 県は実測の在庫から、首都圏 4 県と全国拡張の 31 県はまだ 1 件も
 * 取っていないので市場規模からの見積もりで置いている。初回の巡回が
 * 終わったら scripts/build_area_dataset.ts が吐く実測値で置き直すこと。
 *
 * 47 県ぶんの合計は 1 日あたり約 2,050 分。SCRAPE_MAX_PARALLEL = 4 で
 * 実時間はおよそ 8.6 時間で、日次 cron（24 時間）に対しては余裕がある。
 * 律速は取り込みではなくジオコーディングのほう（新しい町丁目の座標が
 * 埋まるまで、その県の物件は検索に出ない）。
 */
export const SCRAPE_TARGETS: readonly ScrapeTarget[] = [
  // ---- 首都圏。今回の追加分。在庫は見積もり ----
  // 東京は既存最大の兵庫のおよそ 3 倍を見込む。180 分では 7 日に届かない。
  {
    slug: "tokyo",
    name: "東京都",
    lat: 35.6895,
    lon: 139.6917,
    tier: "metro",
    budgetMin: 300,
    everyNDays: 1,
    offsetDays: 0,
  },
  {
    slug: "kanagawa",
    name: "神奈川県",
    lat: 35.4478,
    lon: 139.6425,
    tier: "metro",
    budgetMin: 160,
    everyNDays: 1,
    offsetDays: 0,
  },
  {
    slug: "saitama",
    name: "埼玉県",
    lat: 35.8569,
    lon: 139.6489,
    tier: "metro",
    budgetMin: 100,
    everyNDays: 1,
    offsetDays: 0,
  },
  {
    slug: "chiba",
    name: "千葉県",
    lat: 35.6051,
    lon: 140.1233,
    tier: "metro",
    budgetMin: 90,
    everyNDays: 1,
    offsetDays: 0,
  },

  // ---- 既存 12 県。在庫は 2026-08-08 の areaDirections.json の実測 ----
  // 兵庫 63,309 / 大阪 61,546 / 広島 53,144 / 静岡 42,278 / 愛知 41,953 / 京都 36,732
  {
    slug: "hyogo",
    name: "兵庫県",
    lat: 34.6913,
    lon: 135.183,
    tier: "metro",
    budgetMin: 100,
    everyNDays: 1,
    offsetDays: 0,
  },
  {
    slug: "osaka",
    name: "大阪府",
    lat: 34.6863,
    lon: 135.52,
    tier: "metro",
    budgetMin: 100,
    everyNDays: 1,
    offsetDays: 0,
  },
  {
    slug: "hiroshima",
    name: "広島県",
    lat: 34.3966,
    lon: 132.4596,
    tier: "metro",
    budgetMin: 100,
    everyNDays: 1,
    offsetDays: 0,
  },
  {
    slug: "shizuoka",
    name: "静岡県",
    lat: 34.9769,
    lon: 138.3831,
    tier: "metro",
    budgetMin: 100,
    everyNDays: 1,
    offsetDays: 0,
  },
  {
    slug: "aichi",
    name: "愛知県",
    lat: 35.1815,
    lon: 136.9064,
    tier: "metro",
    budgetMin: 100,
    everyNDays: 1,
    offsetDays: 0,
  },
  {
    slug: "kyoto",
    name: "京都府",
    lat: 35.0212,
    lon: 135.7556,
    tier: "metro",
    budgetMin: 100,
    everyNDays: 1,
    offsetDays: 0,
  },

  // ---- 在庫が少ない県。3 日に 1 回に間引き、位相を散らす ----
  // 三重 19,033 / 滋賀 16,140 / 奈良 12,753 / 鳥取 5,276 / 福井 4,544 / 島根 3,846
  // 60 分 × 3 日に 1 回でも、三重で一巡およそ 11 日。パージの 90 日には十分収まる。
  {
    slug: "mie",
    name: "三重県",
    lat: 34.7303,
    lon: 136.5086,
    tier: "regional",
    budgetMin: 60,
    everyNDays: 3,
    offsetDays: 0,
  },
  {
    slug: "shiga",
    name: "滋賀県",
    lat: 35.0045,
    lon: 135.8686,
    tier: "regional",
    budgetMin: 60,
    everyNDays: 3,
    offsetDays: 1,
  },
  {
    slug: "nara",
    name: "奈良県",
    lat: 34.6851,
    lon: 135.8329,
    tier: "regional",
    budgetMin: 60,
    everyNDays: 3,
    offsetDays: 2,
  },
  {
    slug: "tottori",
    name: "鳥取県",
    lat: 35.5039,
    lon: 134.2377,
    tier: "regional",
    budgetMin: 45,
    everyNDays: 3,
    offsetDays: 0,
  },
  {
    slug: "fukui",
    name: "福井県",
    lat: 36.0652,
    lon: 136.2216,
    tier: "regional",
    budgetMin: 45,
    everyNDays: 3,
    offsetDays: 1,
  },
  {
    slug: "shimane",
    name: "島根県",
    lat: 35.4723,
    lon: 133.0505,
    tier: "regional",
    budgetMin: 45,
    everyNDays: 3,
    offsetDays: 2,
  },
  // ---- ここから全国への拡張分（31 県）。まだ 1 件も取っていない ----
  //
  // slug は public/prefectures.geojson の name_english を小文字にしたもの。
  // 既存 16 県で 16/16 一致することを確認したうえで残りに当てている。
  // 座標は県庁所在地。同じ geojson のポリゴン内に入ることを検算済み。
  //
  // budgetMin は人口規模の帯（>2M:60 / 1-2M:50 / <1M:45）で置いた仮の値。
  // 既存 12 県のような実測が無いので、初回の巡回が一巡したら
  // build_area_dataset.ts が吐く実測の在庫で置き直すこと。
  //
  // 札幌と福岡だけ metro にしてある。人口も賃貸在庫も既存 metro と
  // 同じ規模で、3 日に 1 回では鮮度が保てない。
  {
    slug: "hokkaido",
    name: "北海道",
    lat: 43.0642,
    lon: 141.3469,
    tier: "metro",
    budgetMin: 100,
    everyNDays: 1,
    offsetDays: 0,
  },
  {
    slug: "fukuoka",
    name: "福岡県",
    lat: 33.6064,
    lon: 130.4181,
    tier: "metro",
    budgetMin: 100,
    everyNDays: 1,
    offsetDays: 0,
  },
  {
    slug: "miyagi",
    name: "宮城県",
    lat: 38.2682,
    lon: 140.8694,
    tier: "regional",
    budgetMin: 60,
    everyNDays: 3,
    offsetDays: 0,
  },
  {
    slug: "ibaraki",
    name: "茨城県",
    lat: 36.3418,
    lon: 140.4468,
    tier: "regional",
    budgetMin: 60,
    everyNDays: 3,
    offsetDays: 1,
  },
  {
    slug: "niigata",
    name: "新潟県",
    lat: 37.9026,
    lon: 139.0235,
    tier: "regional",
    budgetMin: 60,
    everyNDays: 3,
    offsetDays: 2,
  },
  {
    slug: "nagano",
    name: "長野県",
    lat: 36.6513,
    lon: 138.181,
    tier: "regional",
    budgetMin: 60,
    everyNDays: 3,
    offsetDays: 0,
  },
  {
    slug: "gifu",
    name: "岐阜県",
    lat: 35.3912,
    lon: 136.7223,
    tier: "regional",
    budgetMin: 50,
    everyNDays: 3,
    offsetDays: 1,
  },
  {
    slug: "gunma",
    name: "群馬県",
    lat: 36.3895,
    lon: 139.0634,
    tier: "regional",
    budgetMin: 50,
    everyNDays: 3,
    offsetDays: 2,
  },
  {
    slug: "tochigi",
    name: "栃木県",
    lat: 36.5657,
    lon: 139.8836,
    tier: "regional",
    budgetMin: 50,
    everyNDays: 3,
    offsetDays: 0,
  },
  {
    slug: "okayama",
    name: "岡山県",
    lat: 34.6618,
    lon: 133.935,
    tier: "regional",
    budgetMin: 50,
    everyNDays: 3,
    offsetDays: 1,
  },
  {
    slug: "fukushima",
    name: "福島県",
    lat: 37.7503,
    lon: 140.4676,
    tier: "regional",
    budgetMin: 50,
    everyNDays: 3,
    offsetDays: 2,
  },
  {
    slug: "kumamoto",
    name: "熊本県",
    lat: 32.7898,
    lon: 130.7417,
    tier: "regional",
    budgetMin: 50,
    everyNDays: 3,
    offsetDays: 0,
  },
  {
    slug: "kagoshima",
    name: "鹿児島県",
    lat: 31.5602,
    lon: 130.5581,
    tier: "regional",
    budgetMin: 50,
    everyNDays: 3,
    offsetDays: 1,
  },
  {
    slug: "okinawa",
    name: "沖縄県",
    lat: 26.2124,
    lon: 127.6809,
    tier: "regional",
    budgetMin: 50,
    everyNDays: 3,
    offsetDays: 2,
  },
  {
    slug: "yamaguchi",
    name: "山口県",
    lat: 34.1861,
    lon: 131.4706,
    tier: "regional",
    budgetMin: 50,
    everyNDays: 3,
    offsetDays: 0,
  },
  {
    slug: "ehime",
    name: "愛媛県",
    lat: 33.8416,
    lon: 132.7657,
    tier: "regional",
    budgetMin: 50,
    everyNDays: 3,
    offsetDays: 1,
  },
  {
    slug: "nagasaki",
    name: "長崎県",
    lat: 32.7448,
    lon: 129.8737,
    tier: "regional",
    budgetMin: 50,
    everyNDays: 3,
    offsetDays: 2,
  },
  {
    slug: "aomori",
    name: "青森県",
    lat: 40.8244,
    lon: 140.74,
    tier: "regional",
    budgetMin: 50,
    everyNDays: 3,
    offsetDays: 0,
  },
  {
    slug: "iwate",
    name: "岩手県",
    lat: 39.7036,
    lon: 141.1527,
    tier: "regional",
    budgetMin: 50,
    everyNDays: 3,
    offsetDays: 1,
  },
  {
    slug: "ishikawa",
    name: "石川県",
    lat: 36.5947,
    lon: 136.6256,
    tier: "regional",
    budgetMin: 50,
    everyNDays: 3,
    offsetDays: 2,
  },
  {
    slug: "oita",
    name: "大分県",
    lat: 33.2382,
    lon: 131.6126,
    tier: "regional",
    budgetMin: 50,
    everyNDays: 3,
    offsetDays: 0,
  },
  {
    slug: "yamagata",
    name: "山形県",
    lat: 38.2404,
    lon: 140.3633,
    tier: "regional",
    budgetMin: 50,
    everyNDays: 3,
    offsetDays: 1,
  },
  {
    slug: "miyazaki",
    name: "宮崎県",
    lat: 31.9111,
    lon: 131.4239,
    tier: "regional",
    budgetMin: 50,
    everyNDays: 3,
    offsetDays: 2,
  },
  {
    slug: "toyama",
    name: "富山県",
    lat: 36.6953,
    lon: 137.2113,
    tier: "regional",
    budgetMin: 45,
    everyNDays: 3,
    offsetDays: 0,
  },
  {
    slug: "kagawa",
    name: "香川県",
    lat: 34.3401,
    lon: 134.0434,
    tier: "regional",
    budgetMin: 45,
    everyNDays: 3,
    offsetDays: 1,
  },
  {
    slug: "akita",
    name: "秋田県",
    lat: 39.7186,
    lon: 140.1024,
    tier: "regional",
    budgetMin: 45,
    everyNDays: 3,
    offsetDays: 2,
  },
  {
    slug: "wakayama",
    name: "和歌山県",
    lat: 34.2261,
    lon: 135.1675,
    tier: "regional",
    budgetMin: 45,
    everyNDays: 3,
    offsetDays: 0,
  },
  {
    slug: "yamanashi",
    name: "山梨県",
    lat: 35.6642,
    lon: 138.5684,
    tier: "regional",
    budgetMin: 45,
    everyNDays: 3,
    offsetDays: 1,
  },
  {
    slug: "saga",
    name: "佐賀県",
    lat: 33.2494,
    lon: 130.2988,
    tier: "regional",
    budgetMin: 45,
    everyNDays: 3,
    offsetDays: 2,
  },
  {
    slug: "tokushima",
    name: "徳島県",
    lat: 34.0658,
    lon: 134.5593,
    tier: "regional",
    budgetMin: 45,
    everyNDays: 3,
    offsetDays: 0,
  },
  {
    slug: "kochi",
    name: "高知県",
    lat: 33.5597,
    lon: 133.5311,
    tier: "regional",
    budgetMin: 45,
    everyNDays: 3,
    offsetDays: 1,
  },
];

/**
 * 同時に走らせるジョブ数。
 *
 * 相手サーバーへのリクエスト頻度はこの値だけで決まる。県を何県足しても、
 * ここを変えなければ負荷は変わらない。各ジョブがページごとに 2〜4 秒
 * （平均 3 秒）待つので、頻度はおよそ maxParallel / 3 秒。
 *
 * 3 のとき約 1 リクエスト/秒。4 に上げて約 1.3 リクエスト/秒。
 * ここを触るときは、増やした分がそのまま相手の負荷になると考えること。
 */
export const SCRAPE_MAX_PARALLEL = 4;

/** DB の住所文字列と突き合わせるための日本語県名。パージの許可リスト */
export const TARGET_PREFECTURE_NAMES: readonly string[] = SCRAPE_TARGETS.map(
  (t) => t.name,
);

/** nifty に投げるローマ字スラッグ */
export const TARGET_PREFECTURE_SLUGS: readonly string[] = SCRAPE_TARGETS.map(
  (t) => t.slug,
);

/** slug -> 日本語名。build_area_dataset.ts が使う */
export const PREF_JP: Readonly<Record<string, string>> = Object.fromEntries(
  SCRAPE_TARGETS.map((t) => [t.slug, t.name]),
);

/**
 * その日に回す県を決める基準日番号。UTC の 1970-01-01 からの日数。
 *
 * ローカル時刻を使うと実行のたびに境界がぶれる。cron は UTC で動くので
 * ここも UTC に揃える。
 */
export function dayIndexUtc(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      86_400_000,
  );
}

/** その日にこの県を回すか */
export function isScheduledOn(target: ScrapeTarget, date: Date): boolean {
  if (target.everyNDays <= 1) return true;
  return dayIndexUtc(date) % target.everyNDays === target.offsetDays;
}

/** その日に回す県の一覧 */
export function targetsForDate(date: Date): ScrapeTarget[] {
  return SCRAPE_TARGETS.filter((t) => isScheduledOn(t, date));
}
