-- 「ケ」と「ヶ」の表記ゆれで、エリア集計から漏れている行を数える（SELECT のみ）
--
-- ## なぜ調べるか
--
-- scripts/build_area_dataset.ts は住所を正規表現で切らず、
-- scripts/jis_city_codes.json の**正式名**で前方一致して数えている
-- （「四日市市」が「四日市」に、「神戸市西区」が「神戸市」になるのを
-- 避けるため）。そのぶん、住所の表記が正式名と 1 文字でも違うと
-- **その行はどの市区町村にも数えられずに消える。**
--
-- 2026-08-28 の横浜 probe で実際に出た:
--
--     神奈川県横浜市保土ケ谷区 | 1342   ← JIS の正式名。数えられる
--     神奈川県横浜市保土ヶ谷区 |  474   ← 収集元の表記。消える
--
-- 「ケ / ヶ」はどちらが正式かが自治体ごとに違う（保土ケ谷区・鎌ケ谷市・
-- 龍ケ崎市・関ケ原町は大文字、茅ヶ崎市・鶴ヶ島市・七ヶ浜町は小文字）
-- ので、一律に片方へ寄せることはできない。**正式名の側から別表記を
-- 作って両方を数える**しかない。直す前に、全国でどれだけ漏れているかを
-- 実測する。
--
-- 対象は jis_city_codes.json で名前に「ケ / ヶ」を含む 17 自治体すべて。
-- 生存条件は src/lib/rentalListingSql.ts の LIVE_LISTING_SQL と同じ。
WITH names(pref, jis, alt) AS (
  VALUES
    ('東京都',   '青ヶ島村',           '青ケ島村'),
    ('神奈川県', '横浜市保土ケ谷区',   '横浜市保土ヶ谷区'),
    ('神奈川県', '茅ヶ崎市',           '茅ケ崎市'),
    ('埼玉県',   '鶴ヶ島市',           '鶴ケ島市'),
    ('千葉県',   '鎌ケ谷市',           '鎌ヶ谷市'),
    ('千葉県',   '袖ケ浦市',           '袖ヶ浦市'),
    ('宮城県',   '刈田郡七ヶ宿町',     '刈田郡七ケ宿町'),
    ('宮城県',   '宮城郡七ヶ浜町',     '宮城郡七ケ浜町'),
    ('茨城県',   '龍ケ崎市',           '龍ヶ崎市'),
    ('長野県',   '駒ヶ根市',           '駒ケ根市'),
    ('岐阜県',   '不破郡関ケ原町',     '不破郡関ヶ原町'),
    ('青森県',   '外ヶ浜町',           '外ケ浜町'),
    ('青森県',   '西津軽郡鰺ヶ沢町',   '西津軽郡鰺ケ沢町'),
    ('青森県',   '上北郡六ヶ所村',     '上北郡六ケ所村'),
    ('岩手県',   '胆沢郡金ケ崎町',     '胆沢郡金ヶ崎町'),
    ('宮崎県',   '西臼杵郡五ヶ瀬町',   '西臼杵郡五ケ瀬町'),
    ('佐賀県',   '神埼郡吉野ヶ里町',   '神埼郡吉野ケ里町')
)
SELECT
  n.pref || n.jis AS jis_name,
  (SELECT count(*) FROM rental_properties p
    WHERE p.address LIKE n.pref || n.jis || '%'
      AND p.lat IS NOT NULL AND p.lon IS NOT NULL
      AND p.rent IS NOT NULL AND p.size_sqm > 0
      AND p.last_seen_at > now() - interval '30 days'
      AND (p.expire_date IS NULL OR p.expire_date >= now())) AS rows_jis,
  (SELECT count(*) FROM rental_properties p
    WHERE p.address LIKE n.pref || n.alt || '%'
      AND p.lat IS NOT NULL AND p.lon IS NOT NULL
      AND p.rent IS NOT NULL AND p.size_sqm > 0
      AND p.last_seen_at > now() - interval '30 days'
      AND (p.expire_date IS NULL OR p.expire_date >= now())) AS rows_lost
FROM names n
ORDER BY rows_lost DESC, jis_name;

-- 直し方の下見: 別表記を OR で足したとき、索引が効くか。
--
-- 集計は市区町村ごとに 1 回、約 1,900 回まわる。OR を足したせいで
-- 前方一致の索引が使えなくなると、1058MB の表を毎回走査することに
-- なって夜間巡回が終わらない。**直す前に読み方を見ておく。**
-- （実行計画だけ見る。EXPLAIN に ANALYZE は付けないので走らない）
EXPLAIN
SELECT count(*)
  FROM rental_properties
 WHERE (address LIKE '神奈川県横浜市保土ケ谷区%'
     OR address LIKE '神奈川県横浜市保土ヶ谷区%')
   AND lat IS NOT NULL AND lon IS NOT NULL
   AND rent IS NOT NULL AND size_sqm > 0
   AND last_seen_at > now() - interval '30 days'
   AND (expire_date IS NULL OR expire_date >= now());

-- 比べる相手（いまの実装。1 通りだけ）
EXPLAIN
SELECT count(*)
  FROM rental_properties
 WHERE address LIKE '神奈川県横浜市保土ケ谷区%'
   AND lat IS NOT NULL AND lon IS NOT NULL
   AND rent IS NOT NULL AND size_sqm > 0
   AND last_seen_at > now() - interval '30 days'
   AND (expire_date IS NULL OR expire_date >= now());
