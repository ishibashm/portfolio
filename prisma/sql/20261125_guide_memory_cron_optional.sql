-- 案内役（/annai/memory）の期限切れ行を削除する任意の pg_cron ジョブ。
--
-- 任意（OPTIONAL）: アプリ側が読み書き・削除のたびに期限切れ行を削除（piggyback cleanup）するため、
-- このファイルを当てなくても期限切れ行は掃除される。
-- Supabase 無料枠など pg_cron が入っていない環境では何もせず NOTICE を出して正常終了する。
--
-- 状態: 未適用（任意）。本人の承認後に必要なら適用する。
-- 適用: Actions → Apply additive SQL → file にこのファイル名 / mode: dry-run の後 mode: apply

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.schedule(
      'guide_memory_expire',
      '17 18 * * *',
      $job$DELETE FROM guide_memory WHERE expires_at <= now()$job$
    );
    RAISE NOTICE 'scheduled pg_cron job guide_memory_expire';
  ELSE
    RAISE NOTICE 'pg_cron is not installed; skipping guide_memory_expire schedule (app deletes expired rows on read/write)';
  END IF;
END
$$;
