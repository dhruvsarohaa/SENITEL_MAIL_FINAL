CREATE TABLE vendors (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  trusted_domains       TEXT[] NOT NULL DEFAULT '{}',
  trusted_contacts      TEXT[] NOT NULL DEFAULT '{}',
  approved_bank_suffixes TEXT[] NOT NULL DEFAULT '{}',
  normal_recipients     TEXT[] NOT NULL DEFAULT '{}',
  risk_state            TEXT NOT NULL DEFAULT 'trusted',
  last_interaction      TIMESTAMPTZ,
  relationship_since    TIMESTAMPTZ,
  anomalies             JSONB NOT NULL DEFAULT '[]',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vendors_domains ON vendors USING gin(trusted_domains);
