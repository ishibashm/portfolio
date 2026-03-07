-- Execute this in the Supabase Dashboard SQL Editor

CREATE TABLE IF NOT EXISTS rental_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_name TEXT NOT NULL,
  area TEXT,
  rent INTEGER,
  management_fee INTEGER,
  layout TEXT,
  size_sqm NUMERIC,
  is_new_build BOOLEAN,
  minutes_to_station INTEGER,
  first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  source_emails TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS) but allow service role access
ALTER TABLE rental_properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow service role full access" ON rental_properties FOR ALL USING (true);
