CREATE TABLE indicators (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id   UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  type      TEXT NOT NULL,
  value     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_indicators_type_value ON indicators(type, value);
CREATE INDEX idx_indicators_case ON indicators(case_id);
