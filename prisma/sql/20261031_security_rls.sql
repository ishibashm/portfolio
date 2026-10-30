-- Review and apply manually, after schema creation. Never run automatically.
-- Browser access is through authenticated Next.js handlers, not PostgREST.
-- Prisma uses a trusted server DB role; RLS does not replace handler ownership checks.
-- Explicit inventory prevents altering extension/vendor tables in public.
BEGIN;
DO $security$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'Account',
    'AgentActivityLog',
    'AgentTheme',
    'BlogPost',
    'KnowledgeChunk',
    'KnowledgeDocument',
    'MarketDailySummary',
    'McpAccessAudit',
    'McpCalculationLease',
    'McpGrant',
    'McpProviderState',
    'McpRateBucket',
    'MemoryEntry',
    'MetaphysicalStateLog',
    'MunicipalityWealth',
    'PortfolioImage',
    'RealEstateTarget',
    'RelocationHistory',
    'RelocationSimulation',
    'ScrapeTask',
    'Session',
    'TelemetryLog',
    'TimingAstrology',
    'User',
    'VerificationToken',
    'VisualizedComponent',
    'XPost',
    'api_usage',
    'contact_messages',
    'direction_comments',
    'favorite_days',
    'favorite_properties',
    'geocode_towns',
    'land_listings',
    'land_price_points',
    'listing_candidate_rates',
    'listing_candidates',
    'listing_email_connections',
    'listing_email_oauth_states',
    'municipality_housing_stats',
    'notification_consents',
    'page_views',
    'postal_codes',
    'practitioners',
    'property_transactions',
    'reminders',
    'rental_price_history',
    'rental_properties',
    'saved_analyses',
    'scraper_state',
    'search_console_daily',
    'user_configs',
    'user_spots',
    'voice_sessions',
    'voice_tool_calls',
    'voice_usage_ledgers'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      RAISE NOTICE 'Absent application table: % (rerun after creation)', table_name;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    -- Existing permissive policies OR together; remove them before sealing access.
    FOR policy_name IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', policy_name, table_name);
    END LOOP;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    -- Also seal column ACLs: table REVOKE alone does not remove column grants.
    FOR policy_name IN
      SELECT attname FROM pg_attribute
      WHERE attrelid = to_regclass(format('public.%I', table_name))
        AND attnum > 0 AND NOT attisdropped
    LOOP
      EXECUTE format('REVOKE ALL (%I) ON public.%I FROM PUBLIC, anon, authenticated', policy_name, table_name);
    END LOOP;
    -- No anon/authenticated policy: default deny, including private profile JSON.
    -- The service role is server-only; no new grants or BYPASSRLS roles are created.
    EXECUTE format('CREATE POLICY server_only ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', table_name);
  END LOOP;
END
$security$;
COMMIT;
