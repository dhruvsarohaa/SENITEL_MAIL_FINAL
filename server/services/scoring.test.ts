import { describe, it, expect } from "vitest";
import { fuseScores, calculateShouldHold } from "./scoring.js";

describe("fuseScores - Current Behavior", () => {
  it("calculates basic rule-based score without bonuses", () => {
    const result = fuseScores({
      ruleBasedScore: 50,
      behavioralDelta: 0,
      campaignMatchCount: 0,
    });
    expect(result.finalScore).toBe(50);
  });

  it("applies behavioral delta", () => {
    const result = fuseScores({
      ruleBasedScore: 50,
      behavioralDelta: 15,
      campaignMatchCount: 0,
    });
    expect(result.finalScore).toBe(65);
  });

  it("applies campaign delta if campaignMatchCount > 0", () => {
    const result = fuseScores({
      ruleBasedScore: 50,
      behavioralDelta: 0,
      campaignMatchCount: 1,
    });
    expect(result.finalScore).toBe(62); // 50 + 12
    expect(result.campaignDelta).toBe(12);
  });

  it("applies aiAgreement bonus", () => {
    const result = fuseScores({
      ruleBasedScore: 50,
      behavioralDelta: 0,
      campaignMatchCount: 0,
      aiAgrees: true,
    });
    expect(result.finalScore).toBe(55); // 50 + 5
  });

  it("clamps score to 99 max", () => {
    const result = fuseScores({
      ruleBasedScore: 90,
      behavioralDelta: 15,
      campaignMatchCount: 1,
      aiAgrees: true,
    });
    expect(result.finalScore).toBe(99); // 90 + 15 + 12 + 5 = 122 -> 99
  });
});

describe("calculateShouldHold - Current Behavior", () => {
  it("holds if invoice_fraud and has payment change", () => {
    expect(
      calculateShouldHold({
        threatClass: "invoice_fraud",
        hasPaymentChange: true,
        hasBankAccount: false,
        riskScore: 50,
      }),
    ).toBe(true);
  });

  it("holds if invoice_fraud and has bank account", () => {
    expect(
      calculateShouldHold({
        threatClass: "invoice_fraud",
        hasPaymentChange: false,
        hasBankAccount: true,
        riskScore: 50,
      }),
    ).toBe(true);
  });

  it("holds if risk score >= 85 regardless of threat class", () => {
    expect(
      calculateShouldHold({
        threatClass: "benign",
        hasPaymentChange: false,
        hasBankAccount: false,
        riskScore: 85,
      }),
    ).toBe(true);
  });

  it("does not hold if invoice_fraud without financial changes and score < 85", () => {
    expect(
      calculateShouldHold({
        threatClass: "invoice_fraud",
        hasPaymentChange: false,
        hasBankAccount: false,
        riskScore: 84,
      }),
    ).toBe(false);
  });
});
