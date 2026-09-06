CREATE TABLE campaigns (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  severity            TEXT NOT NULL,
  shared_indicators   TEXT[] NOT NULL DEFAULT '{}',
  first_seen          TIMESTAMPTZ NOT NULL,
  last_seen           TIMESTAMPTZ NOT NULL,
  case_ids            TEXT[] NOT NULL DEFAULT '{}',
  victim_teams        TEXT[],
  domains             TEXT[],
  reply_tos           TEXT[],
  bank_accounts       TEXT[],
  attachment_hashes   TEXT[],
  recommended_actions TEXT[],
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
