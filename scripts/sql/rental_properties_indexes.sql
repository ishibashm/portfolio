-- rental_properties にスキャナー用のインデックスを作る。
--
-- このテーブルだけインデックスが 1 つも無く（主キーの uuid と url の unique のみ）、
-- 112 万行に対して毎回シーケンシャルスキャンが走っていた。
--
-- prisma db push でも作れるが、その場合 CREATE INDEX が排他ロックを取り、
-- 張り終わるまで書き込みが止まる。夜間のスクレイパーと重なると取り込みが
-- 詰まるので、本番には CONCURRENTLY で当てる。
--
-- 名前は Prisma の既定の命名（<table>_<columns>_idx）に合わせてある。
-- ずらすと db push が「無い」と判断して非 CONCURRENTLY で作り直す。
--
--   実行方法（DIRECT_URL の接続先に対して）
--     psql "$DIRECT_URL?sslrootcert=system" -f scripts/sql/rental_properties_indexes.sql
--
-- DIRECT_URL は sslmode=verify-full なので、証明書の検証先を渡さないと
-- libpq が ~/.postgresql/root.crt を探しに行って落ちる。サーバー証明書は
-- 公的な CA が出しているので、OS の証明書ストアを指せばよい。
-- .github/workflows/db-index.yml から実行する場合はワークフロー側で付ける。
--
-- CONCURRENTLY はトランザクション内で実行できない。psql に -1 / --single-transaction
-- を付けないこと。途中で失敗すると INVALID なインデックスが残るので、
-- そのときは同名を DROP INDEX してからやり直す。

-- 鮮度表示のための max(last_seen_at)。絞り込み条件を持たない集計なので、
-- インデックスが無いとリクエストごとに全行を読む。ここが最も効く。
-- パージの last_seen_at 判定にも使われる。
CREATE INDEX CONCURRENTLY IF NOT EXISTS rental_properties_last_seen_at_idx
  ON rental_properties (last_seen_at);

-- 出発地からの半径・地図の表示範囲による矩形絞り込み。
CREATE INDEX CONCURRENTLY IF NOT EXISTS rental_properties_lat_lon_idx
  ON rental_properties (lat, lon);

-- 都道府県の絞り込みは address LIKE '兵庫県%' の前方一致。
-- 既定の照合順序では通常の btree が前方一致に使われないため演算子クラスを指定する。
CREATE INDEX CONCURRENTLY IF NOT EXISTS rental_properties_address_idx
  ON rental_properties (address text_pattern_ops);

-- 統計を最新にしておかないと、作った直後のプランナーがインデックスを選ばない。
ANALYZE rental_properties;

-- 確認用。3 本とも valid になっていること。
--   SELECT indexrelid::regclass AS name, indisvalid
--     FROM pg_index
--    WHERE indrelid = 'rental_properties'::regclass;
