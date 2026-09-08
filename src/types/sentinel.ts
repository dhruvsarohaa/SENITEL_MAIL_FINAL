export type Severity = "critical" | "high" | "medium" | "low" | "safe";

export type OriginAssessmentType =
  | "Spoofed Domain"
  | "Likely Compromised Account"
  | "Likely Anonymized Infrastructure"
  | "Likely Malicious Infrastructure"
  | "Insufficient Evidence";

export interface OriginAssessment {
  assessment: OriginAssessmentType;
  confidence: number;
  reasons: string[];
}

export interface DomainIntelligence {
  domain: string;
  a_records: string[];
  aaaa_records: string[];
  mx_records: string[];
  ns_records: string[];
  registrar?: string;
  creation_date?: string;
  expiration_date?: string;
  age_days?: number;
}

export type ThreatClass =
  "invoice_fraud" | "ceo_impersonation" | "credential_phishing" | "malware_delivery" | "benign";

export type AnalystDecision =
  "pending" | "safe" | "payment_held" | "escalated" | "confirmed_threat";

export type AnalystActionType = "mark_safe" | "hold_payment" | "escalate" | "confirm_threat";

export interface AnalystAction {
  type: AnalystActionType;
  note?: string;
  analyst?: string;
  created_at?: string;
}

export interface AuthResult {
  spf: "pass" | "fail" | "softfail" | "none" | "neutral";
  dkim: "pass" | "fail" | "none";
  dmarc: "pass" | "fail" | "none";
}

export interface RelayHop {
  index: number;
  host: string;
  ip: string;
  asn?: string;
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  isp?: string;
  organization?: string;
  timestamp?: string;
  suspicious?: boolean;
  isHosting?: boolean;
  isVpn?: boolean;
  isProxy?: boolean;
  isTor?: boolean;
}
export interface EvidenceSignal {
  label: string;
  detail?: string;
  weight?: number;
  severity?: Severity;
}

export interface Evidence {
  intent: {
    classification: ThreatClass;
    model_confidence: number;
    signals: EvidenceSignal[];
  };
  sender_identity: {
    from_address: string;
    display_name?: string;
    reply_to?: string;
    return_path?: string;
    auth: AuthResult;
    trusted_vendor?: string;
    vendor_domain_match?: boolean;
    domain_alignment?: string;
    notes?: EvidenceSignal[];
  };
  financial: {
    invoice_amount?: number;
    currency?: string;
    bank_account_last4?: string;
    bank_account_known?: boolean;
    payment_change_requested?: boolean;
    beneficiary?: string;
    notes?: EvidenceSignal[];
  };
  technical: {
    urls: string[];
    domains: string[];
    relay_ips: string[];
    attachments: {
      filename: string;
      mime_type?: string;
      size_bytes?: number;
      sha256?: string;
      suspicious?: boolean;
    }[];
  };
  behavioral?: {
    flags: string[];
  };
  /** Known-good relationship signals used to detect a compromised, genuine sender. */
  vendor_relationship?: {
    trusted_domain: string;
    known_contact: string;
    approved_bank_suffixes: string[];
    normal_recipients?: string[];
  };
}

export interface TimelineEntry {
  order: number;
  title: string;
  description: string;
  severity: Severity;
  weight?: number;
}

export interface GraphNode {
  id: string;
  label: string;
  type: "email" | "domain" | "url" | "reply_to" | "bank_account" | "attachment";
  suspicious?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  suspicious?: boolean;
}

export interface CampaignGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface CaseSummary {
  id: string;
  case_number: string;
  subject: string;
  sender: string;
  threat_class: ThreatClass;
  risk_score: number;
  severity: Severity;
  decision: AnalystDecision;
  assigned_action?: string;
  vendor?: string;
  amount_at_risk?: number;
  triage_minutes?: number;
  currency?: string;
  created_at: string;
}

export interface Case extends CaseSummary {
  confidence: number;
  decision_banner: string;
  origin_assessment?: OriginAssessment;
  domain_intelligence?: DomainIntelligence[];
  recipients?: string[];
  body_preview?: string;
  evidence: Evidence;
  timeline: TimelineEntry[];
  relay_path: RelayHop[];
  campaign_id?: string;
  campaign_graph?: CampaignGraphData;
  actions?: AnalystAction[];
}

export interface AnalysisResult {
  case_id: string;
  case?: Case;
}

export interface Campaign {
  id: string;
  name: string;
  severity: Severity;
  case_count: number;
  shared_indicators: string[];
  first_seen: string;
  last_seen: string;
  case_ids: string[];
  cases?: CaseSummary[];
  victim_teams?: string[];
  domains?: string[];
  reply_tos?: string[];
  bank_accounts?: string[];
  attachment_hashes?: string[];
  recommended_actions?: string[];
}

export interface VendorProfile {
  id: string;
  name: string;
  trusted_domains: string[];
  trusted_contacts: string[];
  approved_bank_suffixes: string[];
  normal_recipients: string[];
  related_case_ids?: string[];
  risk_state?: "trusted" | "watch" | "at_risk";
  last_interaction?: string;
  relationship_since?: string;
  anomalies?: { label: string; detail?: string; severity?: Severity; at?: string }[];
}
