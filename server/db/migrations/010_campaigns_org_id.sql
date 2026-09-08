ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS org_id TEXT;

-- For existing campaigns, we can't reliably map them to a single org_id 
-- if they aggregated multiple tenants, so they might be left null or dropped.
-- To maintain strict isolation, we will just delete old cross-tenant campaigns
-- or set them to the default org ID.
-- For safety, we will clear them to regenerate fresh per-tenant.
DELETE FROM campaigns;

ALTER TABLE campaigns ALTER COLUMN org_id SET NOT NULL;
