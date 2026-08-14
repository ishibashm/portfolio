/**
 * 「いま掲載されている物件」の条件。SQL の断片として持つ。
 *
 * 同じ条件が 2 か所で要る。
 *   - scripts/build_area_dataset.ts   毎晩の県別件数（静的ファイル）
 *   - /api/rentals/arbitrage/prefecture-counts  絞り込み後の県別件数
 *
 * 片方だけ直すと、**絞り込みを何も掛けていないのに数字が違う**という形で
 * 出る。どちらが正しいのか画面からは分からないので、条件は 1 か所に置く。
 *
 * 内容は「地図に置けて、家賃と広さが分かり、まだ生きている掲載」。
 *   lat / lon        地図に出せない行は数えない（俯瞰の件数なので）
 *   rent / size_sqm  ㎡単価が出せない行は候補にならない
 *   last_seen_at     30 日見かけていない行は掲載終了とみなす
 *   expire_date      掲載期限を過ぎた行はリンクが 404 になる
 *
 * 列名は修飾していない。呼ぶ側が rental_properties に別名を付けても、
 * これらの列を持つ表が 1 つなら曖昧にならない。
 */
export const LIVE_LISTING_SQL = `lat IS NOT NULL AND lon IS NOT NULL
      AND rent IS NOT NULL AND size_sqm > 0
      AND last_seen_at > now() - interval '30 days'
      AND (expire_date IS NULL OR expire_date >= now())`;
