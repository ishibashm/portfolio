-- 読み取り専用の確認。20261117_data_minimization.sql の前後に db-apply-sql で流し、
-- 列の有無・型・既定値と、行数が変わっていないことを見る。何も書き換えない。
SELECT 'rows user_configs' AS what, count(*) AS n FROM user_configs
UNION ALL
SELECT 'rows contact_messages', count(*) FROM contact_messages;

SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND (table_name, column_name) IN (
     ('user_configs', 'personal_cloud_opt_in'),
     ('user_configs', 'ask_data_last_used_at'),
     ('contact_messages', 'resolved_at'))
 ORDER BY table_name, column_name;
