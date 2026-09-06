CREATE TABLE cases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number   TEXT UNIQUE NOT NULL,
  subject       TEXT NOT NULL,
  sender        TEXT NOT NULL,
  recipients    TEXT[],
  threat_class  TEXT NOT NULL,
  risk_score    INTEGER NOT NULL,
  severity      TEXT NOT NULL,
  confidence    REAL NOT NULL,
  decision      TEXT NOT NULL DEFAULT 'pending',
  assigned_action TEXT,
  decision_banner TEXT,
  vendor_id     UUID REFERENCES vendors(id),
  vendor_name   TEXT,
  amount_at_risk NUMERIC,
  currency      TEXT,
  body_preview  TEXT,
  evidence      JSONB NOT NULL,
  timeline      JSONB NOT NULL DEFAULT '[]',
  relay_path    JSONB NOT NULL DEFAULT '[]',
  campaign_id   TEXT,
  campaign_graph JSONB,
  raw_eml       BYTEA,
  eml_sha256    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cases_threat ON cases(threat_class);
CREATE INDEX idx_cases_severity ON cases(severity);
CREATE INDEX idx_cases_created ON cases(created_at DESC);
CREATE INDEX idx_cases_campaign ON cases(campaign_id);
CREATE INDEX idx_cases_vendor ON cases(vendor_id);
