-- Seed initial trusted vendors for behavioral baseline comparison
INSERT INTO vendors (
  id, name, trusted_domains, trusted_contacts, approved_bank_suffixes, normal_recipients, risk_state, relationship_since
) VALUES
(
  'a1111111-1111-1111-1111-111111111111',
  'Harborline Logistics',
  ARRAY['harborline-logistics.com', 'harborline.example'],
  ARRAY['billing@harborline-logistics.com', 'invoices@harborline-logistics.com'],
  ARRAY['9821', '4401'],
  ARRAY['ap@example.com', 'finance@example.com'],
  'trusted',
  now() - interval '2 years'
),
(
  'b2222222-2222-2222-2222-222222222222',
  'Apex Global Cloud',
  ARRAY['apex-global.com', 'apex.cloud'],
  ARRAY['billing@apex-global.com', 'ar@apex-global.com'],
  ARRAY['1284', '5519'],
  ARRAY['ap@example.com', 'it-finance@example.com'],
  'trusted',
  now() - interval '1 year'
),
(
  'c3333333-3333-3333-3333-333333333333',
  'Stratton Legal Advisory',
  ARRAY['strattonlegal.com'],
  ARRAY['retained@strattonlegal.com'],
  ARRAY['7730'],
  ARRAY['ap@example.com'],
  'trusted',
  now() - interval '3 years'
)
ON CONFLICT (id) DO NOTHING;
