-- 名寄せキーと市区町村キーを「書き込み時に前払い」する列。
--
-- 物件スキャナーはリクエストのたびに、対象行（全国だと約 100 万行）の
-- それぞれへ正規表現を 6 回かけてキーを作り、その鍵で全行をソートして
-- 名寄せしていた。EXPLAIN ANALYZE の実測（2026-08-14）で全国走査 22 秒の
-- 律速がこの CPU だと確定している（work_mem を広げても変わらなかった）。
--
-- 賃貸検索サービスが速いのは、この種の正規化を取り込み時に済ませて
-- いるから。同じ構造にする。列はトリガーが埋め、クエリは列を読むだけに
-- なる（クエリ側の切り替えは別 PR。この DDL が当たるまでマージしない）。
--
-- 生成列（GENERATED ALWAYS AS）にしない理由: prisma db push が生成列を
-- 表現できず、run-seed のたびに定義差分として扱われる。普通の列＋
-- トリガーなら、列は schema.prisma に書けて db push と食い違わない。
-- トリガーと関数は Prisma の管理外なので db push に消されない。
--
-- 足すだけの DDL。二度当てても同じ結果になる。
-- 正規表現は src/utils/arbitrageQuery.ts の NAME_KEY_SQL /
-- MUNICIPALITY_SQL と同じもの。**片方を変えるときは必ず両方変える**
-- （ずれると、古い行と新しい行で名寄せの単位が変わる）。
--
-- 適用: Actions → Apply additive SQL → file にこのファイル名 / mode: apply
--   ・所要はバックフィル＋索引で数分。行ロックと索引作成の書き込み
--     ロックを取るので、**夜間巡回（scrape-rentals）と重ねないこと**
--     （concurrency グループで直列化はされるが、待ち合いになる）
--   ・適用したら schema.prisma を揃える PR（クエリ切り替えと同時）を
--     マージする。先に schema だけ出すと、DB に無い列を Prisma が
--     SELECT して落ちる

-- 1) 列。NULL 許容で足すので即時（テーブル書き換え無し）。
ALTER TABLE rental_properties ADD COLUMN IF NOT EXISTS name_key text;
ALTER TABLE rental_properties ADD COLUMN IF NOT EXISTS municipality_key text;

-- 2) 書き込み時に埋めるトリガー。
--    UPDATE は元の列が変わったときだけ発火させる。バックフィルの
--    UPDATE（name_key だけを書く）で再帰的に走らせない。
CREATE OR REPLACE FUNCTION rental_properties_fill_keys() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.name_key := regexp_replace(
    coalesce(NEW.property_name, ''),
    '[\s　]*((?:地下)?[0-9]+階)?[\s　]*(新築|築[0-9]+年([0-9]+ヶ月)?)?の?賃貸物件[\s　]*$',
    ''
  );
  NEW.municipality_key := NULLIF(
    COALESCE((regexp_match(NEW.address, '^(北海道|東京都|京都府|大阪府|.{2,3}県)'))[1], '') ||
    COALESCE(
      (regexp_match(regexp_replace(NEW.address, '^(北海道|東京都|京都府|大阪府|.{2,3}県)', ''), '^(.+?市.+?区)'))[1],
      (regexp_match(regexp_replace(NEW.address, '^(北海道|東京都|京都府|大阪府|.{2,3}県)', ''), '^(.+?[市区町村])'))[1],
      ''
    ),
    ''
  );
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS rental_properties_fill_keys_trg ON rental_properties;
CREATE TRIGGER rental_properties_fill_keys_trg
  BEFORE INSERT OR UPDATE OF property_name, address ON rental_properties
  FOR EACH ROW EXECUTE FUNCTION rental_properties_fill_keys();

-- 3) 既存行のバックフィル。name_key IS NULL の行だけなので二度当てても
--    やり直しにならない。約 100 万行で数分。
UPDATE rental_properties SET
  name_key = regexp_replace(
    coalesce(property_name, ''),
    '[\s　]*((?:地下)?[0-9]+階)?[\s　]*(新築|築[0-9]+年([0-9]+ヶ月)?)?の?賃貸物件[\s　]*$',
    ''
  ),
  municipality_key = NULLIF(
    COALESCE((regexp_match(address, '^(北海道|東京都|京都府|大阪府|.{2,3}県)'))[1], '') ||
    COALESCE(
      (regexp_match(regexp_replace(address, '^(北海道|東京都|京都府|大阪府|.{2,3}県)', ''), '^(.+?市.+?区)'))[1],
      (regexp_match(regexp_replace(address, '^(北海道|東京都|京都府|大阪府|.{2,3}県)', ''), '^(.+?[市区町村])'))[1],
      ''
    ),
    ''
  )
WHERE name_key IS NULL;

-- 4) 名寄せの並び（DISTINCT ON のキー）をそのまま引ける索引。
--    これでキー順のソートが索引走査に置き換わる。
--    名前は Prisma の既定（<table>_<columns>_idx）に合わせる。ずらすと
--    db push が「無い」と判断して作り直す（rental_properties_indexes.sql
--    と同じ注意）。--single-transaction で当てるため CONCURRENTLY は
--    使えない。作成中は書き込みが待たされるので巡回と重ねない。
CREATE INDEX IF NOT EXISTS rental_properties_name_key_floor_layout_size_sqm_rent_idx
  ON rental_properties (name_key, floor, layout, size_sqm, rent);

-- 5) 統計を更新。無いと直後のプランナーが索引を選ばない。
ANALYZE rental_properties;

-- 確認用:
--   SELECT count(*) FILTER (WHERE name_key IS NULL) AS missing,
--          count(*) AS total FROM rental_properties;
--   missing = 0 になっていること。
