-- Jeoff CRM — Supabase Schema
-- Paste this entire file into: Supabase dashboard → SQL Editor → New query → Run

CREATE TABLE IF NOT EXISTS crm_data (
  key         TEXT PRIMARY KEY,
  data        JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Allow the anon key full access (personal tool, no auth needed)
ALTER TABLE crm_data DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON crm_data TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_data TO authenticated;
