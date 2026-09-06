export interface ScoringBreakdown {
  ruleBasedScore: number;
  behavioralDelta: number;
  campaignDelta: number;
  aiAgreementBonus: number;
  finalScore: number; // 0-99
  finalConfidence: number; // 0.0-1.0
}

export function fuseScores(params: {
  ruleBasedScore: number;
  behavioralDelta: number;
  campaignMatchCount: number;
  aiAgrees?: boolean;
}): ScoringBreakdown {
  const campaignDelta = params.campaignMatchCount > 0 ? 12 : 0;
  const aiAgreementBonus = params.aiAgrees ? 5 : 0;

  let finalScore =
    params.ruleBasedScore + params.behavioralDelta + campaignDelta + aiAgreementBonus;
  finalScore = Math.max(0, Math.min(99, finalScore)); // clamp to 0-99

  let finalConfidence = 0.5 + finalScore / 200;
  finalConfidence = Math.max(0.35, Math.min(0.98, finalConfidence));

  return {
    ruleBasedScore: params.ruleBasedScore,
    behavioralDelta: params.behavioralDelta,
    campaignDelta,
    aiAgreementBonus,
    finalScore,
    finalConfidence,
  };
}
