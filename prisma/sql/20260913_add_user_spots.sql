-- 利用者が自分で登録した地点（お気に入りの場所）を DB に持つ表を足す。
--
-- ## なぜ要るか
--
-- 利用者の依頼（2026-09-13）:「お気に入りの場所も DB に保存してほしい」。
--
-- これまで `src/lib/userSpots.ts` は **localStorage だけ**に置いていた
-- （同ファイルの註「サーバーに送らない」）。端末を変える・履歴を消すと
-- 消えるので、登録した地点が残らない。
--
-- ## 増えるのは個人情報
--
-- 入るのは**利用者が選んだ地点の名前と座標**（「実家」「候補の物件」など）。
-- CLAUDE.md 6 節の「戻せないもの」に当たるため、利用者の指示があって
-- から作っている。列を消してもそこに入ったデータは戻らない。
--
-- 読み書きは本人だけ（`user_id` はログイン中の uuid。favorite_properties
-- と同じ作り）。他人の行は API が返さない。
--
-- ## 同じ地点を重ねない鍵
--
-- 画面側の `sameSpot` は**座標を 5 桁（約 1m）に丸めて**同じ地点かを
-- 決めている。同じ規則を DB でも使えるよう、丸めた文字列を
-- `point_key`（"35.68950,139.69170"）として持ち、`(user_id, point_key)`
-- を一意にする。浮動小数の列そのものに一意を張ると、丸めの差で同じ
-- 地点が 2 行になる。
--
-- ## 既定値を置かない
--
-- 名前も座標も利用者の値。DEFAULT を置くと、当てた日に全員がその値を
-- 選んだことになる（CLAUDE.md 6 節）。`created_at` の now() は行が
-- できた時刻そのものなので置く。
--
-- 足すだけ。DROP も ALTER COLUMN もしない。

CREATE TABLE IF NOT EXISTS user_spots (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL,
  name        TEXT NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lon         DOUBLE PRECISION NOT NULL,
  point_key   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 同じ人が同じ地点を 2 回登録しても 1 行（上の註）。
CREATE UNIQUE INDEX IF NOT EXISTS user_spots_user_point_key
  ON user_spots (user_id, point_key);

-- 一覧は「登録した順」で出す。
CREATE INDEX IF NOT EXISTS user_spots_user_created_at
  ON user_spots (user_id, created_at);
