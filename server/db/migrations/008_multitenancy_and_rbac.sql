-- Migration 008: Multi-tenancy, RBAC, and Mailbox Connectors

CREATE TABLE IF NOT EXISTS organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'enterprise',
  settings    JSONB NOT NULL DEFAULT '{"auto_hold_threshold": 80, "containment_channels": ["slack", "webhook"]}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'analyst', -- admin, finance_approver, analyst, auditor
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, email)
);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);

CREATE TABLE IF NOT EXISTS api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  key_hash    TEXT NOT NULL,
  prefix      TEXT NOT NULL, -- e.g. sm_live_xxxx
  role        TEXT NOT NULL DEFAULT 'admin',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id);

CREATE TABLE IF NOT EXISTS mailbox_connectors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL, -- m365, google_workspace
  name          TEXT NOT NULL,
  mailbox       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active', -- active, paused, error
  config        JSONB NOT NULL DEFAULT '{}',
  messages_synced INTEGER NOT NULL DEFAULT 0,
  last_sync_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_connectors_org ON mailbox_connectors(org_id);

-- Add org_id to existing core tables
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_vendors_org ON vendors(org_id);

ALTER TABLE cases ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE cases ADD COLUMN IF NOT EXISTS connector_id UUID REFERENCES mailbox_connectors(id);
CREATE INDEX IF NOT EXISTS idx_cases_org ON cases(org_id);
CREATE INDEX IF NOT EXISTS idx_cases_connector ON cases(connector_id);

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_campaigns_org ON campaigns(org_id);

-- Seed Default Organization & Admin User
INSERT INTO organizations (id, name, slug, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'Sentinel Corporation', 'sentinel-corp', 'enterprise')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO users (id, org_id, email, name, role)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'security-admin@sentinelmail.io',
  'Security Admin',
  'admin'
)
ON CONFLICT (org_id, email) DO NOTHING;

-- Associate existing seed data with the default organization
UPDATE vendors SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE cases SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE campaigns SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
