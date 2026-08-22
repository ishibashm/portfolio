-- 家賃の変化を記録する表。**足すだけ。**
--
-- rental_properties は rent を 1 個しか持っていない。「いま何円か」だけで
-- 履歴が無いので、「いくらから いくらに下がったか」を出す材料が存在しない。
-- 値下げ追跡はここが埋まらないと始まらない。
--
-- **当てた日からしか貯まらない。**過去にさかのぼって「3 か月前は 8 万だった」
-- を復元する方法は無い。早く始めるほど早く使えるようになる、という類の話。
--
-- ## 変わったときだけ 1 行
--
-- 毎晩 100 万行の写しを取ると 1 日 100 万行増えて破綻する。**変化があった
-- ものだけ**を入れる。家賃が動く掲載は一部なので、実際に増えるのは
-- 1 日あたり数百〜数千行のはず（実測して報告する）。
--
-- ## 外部キーを張らない
--
-- purge_rental_properties が掲載を消す。FK があると、消すときに履歴まで
-- 巻き添えになるか、purge 自体が止まる。**掲載が消えたあとも履歴は残したい。**
-- 「いくらまで下げて、それでも決まらずに消えた」は市場の情報そのもので、
-- 掲載が生きているあいだだけの話ではない。
--
-- そのぶん days_listed をここに持たせて、**この表だけで完結**させる。
-- 掲載が消えると first_seen_at も消えるので、後から計算できない。
--
-- ## 既定値について
--
-- observed_at に DEFAULT now() を置いている。CLAUDE.md の「既定値を置かない」
-- は**既存の行に一律の値が入るのを避ける**ための決め事で、この表は新規で
-- 空なので当てはまらない。入る行はすべて、その瞬間に観測したもの。

CREATE TABLE IF NOT EXISTS rental_price_history (
  id          bigserial   PRIMARY KEY,
  -- rental_properties.id。FK は張らない（上の理由）
  property_id uuid        NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  -- 変化後・変化前の家賃（円）。変わったときだけ入れるので両方入る
  rent        integer     NOT NULL,
  prev_rent   integer     NOT NULL,
  -- 掲載開始から何日目の変化か。掲載が消えると出せなくなるのでここに持つ
  days_listed integer
);

-- 1 件の掲載の値動きを時系列で引く
CREATE INDEX IF NOT EXISTS rental_price_history_property_idx
  ON rental_price_history (property_id, observed_at);

-- 「直近 30 日の値下げ」のような期間での集計
CREATE INDEX IF NOT EXISTS rental_price_history_observed_idx
  ON rental_price_history (observed_at);
