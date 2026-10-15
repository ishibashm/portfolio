-- Optional non-destructive constraint upgrade where the earlier MCP DDL was
-- already applied. Do not run on production without owner review and backup.
-- A fresh database uses 20261011_mcp_grants.sql with get_kanshi included.
-- Metadata must exactly match the old or current known event CHECK. An unknown
-- constraint or absent table raises an error; the transaction rolls back.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TEMP TABLE "_mcp_expected_old_audit_event" (
  event TEXT NOT NULL CHECK (event IN ('authorize', 'refresh', 'revoke', 'initialize', 'tools/list', 'ping', 'notification', 'unknown_method', 'unknown_tool', 'invalid_request', 'get_honmei_star', 'judge_directions', 'find_auspicious_days', 'search_municipality', 'area_directions', 'prefecture_summary', 'list_profiles', 'get_profile', 'judge_profile_directions', 'judge_time_slots'))
) ON COMMIT DROP;

CREATE TEMP TABLE "_mcp_expected_new_audit_event" (
  event TEXT NOT NULL CHECK (event IN ('authorize', 'refresh', 'revoke', 'initialize', 'tools/list', 'ping', 'notification', 'unknown_method', 'unknown_tool', 'invalid_request', 'get_honmei_star', 'get_kanshi', 'judge_directions', 'find_auspicious_days', 'search_municipality', 'area_directions', 'prefecture_summary', 'list_profiles', 'get_profile', 'judge_profile_directions', 'judge_time_slots'))
) ON COMMIT DROP;

DO $$
DECLARE
  audit_table REGCLASS := to_regclass('public."McpAccessAudit"');
  old_definition TEXT;
  new_definition TEXT;
  old_constraints TEXT[];
  new_constraints TEXT[];
BEGIN
  IF audit_table IS NULL THEN
    RAISE EXCEPTION 'MCP_AUDIT_TABLE_MISSING';
  END IF;
  EXECUTE 'LOCK TABLE public."McpAccessAudit" IN ACCESS EXCLUSIVE MODE';

  SELECT pg_get_constraintdef(oid) INTO STRICT old_definition
  FROM pg_constraint
  WHERE conrelid = 'pg_temp."_mcp_expected_old_audit_event"'::regclass
    AND contype = 'c';
  SELECT pg_get_constraintdef(oid) INTO STRICT new_definition
  FROM pg_constraint
  WHERE conrelid = 'pg_temp."_mcp_expected_new_audit_event"'::regclass
    AND contype = 'c';

  SELECT array_agg(conname) FILTER (WHERE pg_get_constraintdef(oid) = old_definition),
         array_agg(conname) FILTER (WHERE pg_get_constraintdef(oid) = new_definition)
  INTO old_constraints, new_constraints
  FROM pg_constraint
  WHERE conrelid = audit_table AND contype = 'c';

  IF coalesce(cardinality(old_constraints), 0) > 1
     OR coalesce(cardinality(new_constraints), 0) > 1
     OR (old_constraints IS NULL AND new_constraints IS NULL) THEN
    RAISE EXCEPTION 'MCP_AUDIT_EVENT_CONSTRAINT_MISMATCH';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = audit_table AND contype = 'c'
      AND position('event' IN pg_get_constraintdef(oid)) > 0
      AND pg_get_constraintdef(oid) NOT IN (old_definition, new_definition)
  ) THEN
    RAISE EXCEPTION 'MCP_AUDIT_EVENT_CONSTRAINT_MISMATCH';
  END IF;

  -- Dropping the old, narrower CHECK and adding the new one is atomic under
  -- ALTER TABLE's lock. If already upgraded, only the metadata check runs.
  IF old_constraints IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public."McpAccessAudit" DROP CONSTRAINT %I', old_constraints[1]);
  END IF;
  IF new_constraints IS NULL THEN
    ALTER TABLE public."McpAccessAudit"
      ADD CONSTRAINT "McpAccessAudit_event_check"
      CHECK ("event" IN ('authorize', 'refresh', 'revoke', 'initialize', 'tools/list', 'ping', 'notification', 'unknown_method', 'unknown_tool', 'invalid_request', 'get_honmei_star', 'get_kanshi', 'judge_directions', 'find_auspicious_days', 'search_municipality', 'area_directions', 'prefecture_summary', 'list_profiles', 'get_profile', 'judge_profile_directions', 'judge_time_slots'));
  END IF;
END $$;

COMMIT;
