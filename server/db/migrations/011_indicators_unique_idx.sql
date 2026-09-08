CREATE UNIQUE INDEX IF NOT EXISTS idx_indicators_case_type_val ON indicators (case_id, type, value);
