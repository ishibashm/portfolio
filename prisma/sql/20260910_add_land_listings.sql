-- 売地（土地の売り出し）の掲載を積む表を足す。
--
-- ## なぜ要るか
--
-- 利用者の要望「土地の売り出しデータの取得表示もしたい」。いま持って
-- いる土地の値段は成約価格（property_transactions）と地価公示
-- （land_price_points）で、どちらも**過去と評価額**。「いま売りに出て
-- いる土地」の在庫は無かった。
--
-- 出どころは nifty の売地一覧（/tochi/{pref}/{city}_ct/）。賃貸の巡回と
-- 同じホスト・同じ URL の形で、2026-09-10 の下見（run 34522593169）で
-- 港区 1 頁に 94 件、賃貸と同じ形で window.Nifty.Data.Bukken に
-- 埋め込まれていることを確かめた。列はその欄から決めている
-- （docs/improvement-backlog.md 25 節の表）。
--
-- ## rental_properties に混ぜない
--
-- 賃貸の表は 45 万行あり、スキャナーの名寄せ（DISTINCT ON）と索引が
-- 賃貸の列（name_key・floor・layout・size_sqm・rent）に合わせてある。
-- 売地は 1 件 1 URL で、rent も layout も無い。混ぜると賃貸の走査に
-- 売地の行が乗り、売地の検索は賃貸の索引を使えない。
--
-- ## 鍵は url
--
-- nifty の url は賃貸と同じく物件ごとに一意。**外部サイトへ直接飛ぶ
-- url が混ざる**（ピタットハウスなど）が、一意であることは変わらない。
--
-- group_id は nifty が同じ土地を束ねる鍵。同じ土地が SUUMO・
-- アットホーム・ピタットハウス由来で 3 行入り、group_id が一致する
-- （下見の港区の先頭 3 件がそれ）。**画面で 1 件に見せる名寄せは
-- group_id で足りる**ので、賃貸のように自前の name_key を組まない。
--
-- ## 既定値を置かない
--
-- price・land_area_sqm・price_per_sqm は掲載の実測で、読めなければ
-- NULL のまま置く。DEFAULT を置くと「読めなかった」と「0 円」の
-- 区別が消える。first_seen_at / last_seen_at の now() は「行を作った・
-- 見かけた時刻」で、rental_properties と同じ。
--
-- plot_ratio_text は文字列のまま。下見では "60%" と 1 つの値しか
-- 出ず、**建ぺい率か容積率か決められない。**数値列にして建ぺい率と
-- 名付けると、容積率だった日に全行が嘘になる。意味が確定してから
-- 数値の列を足す（足すだけなので後から当てられる）。
--
-- ## 個人情報は入らない
--
-- 掲載の内容（所在地・価格・面積・駅）だけ。利用者は入らない。
--
-- 足すだけの DDL。二度当てても同じ結果になる。
-- 定義は prisma/schema.prisma の land_listings と揃えてある
-- （rental_properties と同じ snake_case。賃貸と並べて読む表なので）。
--
-- 適用: Actions → Apply additive SQL → file: このファイル名 / mode: apply

CREATE TABLE IF NOT EXISTS land_listings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- nifty の url。外部サイトの絶対 URL も混ざる。物件ごとに一意。
  url              TEXT NOT NULL UNIQUE,
  -- nifty が同じ土地を束ねる鍵。画面で 1 件に見せるときはこれで寄せる。
  group_id         TEXT,
  -- 所在地の見出し（"東京都港区白金台"）。title と address は同じ値で来る。
  address          TEXT,
  -- 価格（円）。"1億5980万円" / "15,980万円" を読んで整数にする。
  price            BIGINT,
  -- 土地面積（㎡）。"44.33㎡（13.40坪）（実測）" / "44.33m&sup2;" の先頭の数値。
  land_area_sqm    NUMERIC,
  -- 円/㎡。保存時に price / land_area_sqm で入れる。並べ替えと色分けの軸。
  price_per_sqm    INTEGER,
  -- "60%" のような値。意味（建ぺい率か容積率か）が確定するまで文字列のまま。
  plot_ratio_text  TEXT,
  -- "東京メトロ南北線/白金台駅 徒歩3分"。賃貸の access と同じ形。
  access           TEXT,
  -- 座標。住所から国土地理院で引く（賃貸と同じ）。取り込み直後は NULL。
  lat              DOUBLE PRECISION,
  lon              DOUBLE PRECISION,
  -- 県＋市区町村（"東京都港区"）。取り込み時に住所から切り出す。
  municipality_key TEXT,
  -- どの取り込みが書いたか（"nifty_land"）。
  source_scraper   TEXT,
  -- nifty の掲載期限。過ぎたものは画面から外し、purge で消す。
  expire_date      TIMESTAMPTZ,
  first_seen_at    TIMESTAMPTZ DEFAULT now(),
  last_seen_at     TIMESTAMPTZ DEFAULT now()
);

-- 地図の矩形で引く。売地の API は bbox だけを受ける。
CREATE INDEX IF NOT EXISTS land_listings_lat_lon_idx
ON land_listings (lat, lon);

-- 鮮度（最終確認）で外す。purge と「最終更新」の表示。
CREATE INDEX IF NOT EXISTS land_listings_last_seen_at_idx
ON land_listings (last_seen_at);

-- 同じ土地を束ねる。
CREATE INDEX IF NOT EXISTS land_listings_group_id_idx
ON land_listings (group_id);

-- 市区町村ページから引く。
CREATE INDEX IF NOT EXISTS land_listings_municipality_key_idx
ON land_listings (municipality_key);
