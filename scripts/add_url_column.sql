-- Execute this in the Supabase Dashboard SQL Editor to add the URL column

ALTER TABLE rental_properties
ADD COLUMN IF NOT EXISTS url TEXT;
