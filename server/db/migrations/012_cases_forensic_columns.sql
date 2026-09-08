-- Add missing triage_minutes column and forensic intelligence columns
ALTER TABLE cases ADD COLUMN IF NOT EXISTS triage_minutes NUMERIC;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS origin_assessment JSONB;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS domain_intelligence JSONB;
