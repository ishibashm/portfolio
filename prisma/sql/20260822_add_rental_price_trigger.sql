-- 家賃が変わったら rental_price_history に 1 行入れる仕掛け。
--
-- **これは「足すだけの DDL」ではない。**CLAUDE.md 6 節の自走の範囲外なので、
-- 実行するときは必ず利用者の了解を取ること。
--
-- ## なぜ DB 側でやるか
--
-- rental_properties に書いているスクレイパーは **4 つある**。
--
--   nifty_extractor.ts / eheya_extractor.ts / shamaison_extractor.ts
--   gas_rental_scraper.js
--
-- 記録する処理を 4 か所に散らすと、**どれか 1 つを直し忘れたときに
-- 黙って穴が空く。**そのうえ穴が空いたことに気付く手立てが無い（履歴が
-- 少ないのが「値下げが少ない」のか「記録漏れ」なのか区別できない）。
--
-- 錠の中で 1 回だけ動く仕掛けにすれば、**どの経路から書いても必ず通る。**
-- 将来スクレイパーを足したときにも、何もしなくてよい。
--
-- ## 戻し方
--
--   DROP TRIGGER IF EXISTS rental_price_change ON rental_properties;
--   DROP FUNCTION IF EXISTS record_rental_price_change();
--
-- **データは消えない**（履歴の表はそのまま残る）。列も型も何も変えていない
-- ので、外せば元どおりになる。
--
-- ## 重さ
--
-- 夜間の収集は 100 万件ほど upsert する。仕掛けはその全部で走るが、
-- **家賃が変わった行でしか INSERT しない。**変わらなければ比較 1 回で終わる。
-- 実際に何行増えたかは初回の収集後に数えて報告すること。
--
-- 二度当てても同じ結果になる（DROP してから作り直す）。

CREATE OR REPLACE FUNCTION record_rental_price_change()
RETURNS trigger AS $$
BEGIN
  /*
    IS DISTINCT FROM を使うのは、NULL どうしを「変化なし」と見るため。
    = だと NULL 比較が NULL になって条件に入らない。

    片方でも NULL なら記録しない。「取得できなかった」を「0 円に
    値下げした」と読ませない。取りこぼしは、家賃の動きではない。
  */
  IF NEW.rent IS DISTINCT FROM OLD.rent
     AND NEW.rent IS NOT NULL
     AND OLD.rent IS NOT NULL THEN
    INSERT INTO rental_price_history (property_id, rent, prev_rent, days_listed)
    VALUES (
      OLD.id,
      NEW.rent,
      OLD.rent,
      -- 掲載開始から何日目か。first_seen_at が無い古い行では NULL のまま
      CASE
        WHEN OLD.first_seen_at IS NULL THEN NULL
        ELSE GREATEST(0, (now()::date - OLD.first_seen_at::date))
      END
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rental_price_change ON rental_properties;

CREATE TRIGGER rental_price_change
  BEFORE UPDATE OF rent ON rental_properties
  FOR EACH ROW
  EXECUTE FUNCTION record_rental_price_change();
