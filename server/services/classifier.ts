import type { ThreatClass, EvidenceSignal } from "../types.js";
import { classifyRules } from "./eml-parser.js";

export interface ClassificationResult {
  rulesBased: {
    classification: ThreatClass;
    confidence: number;
    signals: EvidenceSignal[];
  };
  aiOverlay?: {
    classification: ThreatClass;
    confidence: number;
    agrees: boolean;
    phrases: string[];
    provider?: "gemini" | "openai";
    reasoning?: string;
  };
  final: {
    classification: ThreatClass;
    confidence: number;
  };
}

const THREAT_CLASSES: ThreatClass[] = [
  "invoice_fraud",
  "ceo_impersonation",
  "credential_phishing",
  "malware_delivery",
  "benign",
];

/**
 * Two-layer email classification:
 * Layer 1: Deterministic regex-based rules (always runs)
 * Layer 2: Google Gemini (prioritized if GEMINI_API_KEY is set) or GPT-4o-mini (if OPENAI_API_KEY is set)
 */
export async function classifyEmail(params: {
  subject: string;
  bodyText: string;
  attachments: { filename: string; suspicious: boolean }[];
  senderDomain: string;
  hasPaymentChange: boolean;
  hasNewBankAccount: boolean;
}): Promise<ClassificationResult> {
  const fullText = `${params.subject}\n${params.bodyText}`;

  // Layer 1: Deterministic rules
  const rulesClass = classifyRules(fullText, params.attachments);
  const rulesConfidence = rulesClass === "benign" ? 0.85 : 0.75;
  const rulesSignals: EvidenceSignal[] = [];

  if (rulesClass !== "benign") {
    rulesSignals.push({
      label: `Rule-based classifier detected: ${rulesClass.replace(/_/g, " ")}`,
      severity: "high",
      weight: 0.18,
    });
  }
  if (params.hasPaymentChange) {
    rulesSignals.push({
      label: "Payment change language detected",
      severity: "critical",
      weight: 0.28,
    });
  }
  if (params.hasNewBankAccount) {
    rulesSignals.push({
      label: "Unrecognized bank account referenced",
      severity: "critical",
      weight: 0.28,
    });
  }

  const rulesBased = {
    classification: rulesClass,
    confidence: rulesConfidence,
    signals: rulesSignals,
  };
  let finalClass = rulesClass;
  let finalConfidence = rulesConfidence;
  let aiOverlay: ClassificationResult["aiOverlay"] = undefined;

  // Layer 2: AI overlay (Gemini prioritized, OpenAI fallback)
  if (process.env["GEMINI_API_KEY"]) {
    try {
      const aiResult = await callGemini(params.subject, params.bodyText);
      if (aiResult) {
        const agrees = aiResult.classification === rulesClass;
        aiOverlay = {
          classification: aiResult.classification,
          confidence: aiResult.confidence,
          agrees,
          phrases: aiResult.phrases,
          provider: "gemini",
          reasoning: aiResult.reasoning,
        };

        if (agrees) {
          finalConfidence = Math.min(0.98, finalConfidence + 0.1);
        } else if (aiResult.confidence > rulesConfidence) {
          finalClass = aiResult.classification;
          finalConfidence = aiResult.confidence;
        }
      }
    } catch (err) {
      console.error("Gemini classification failed, falling back to rules-based:", err);
    }
  } else if (process.env["OPENAI_API_KEY"]) {
    try {
      const aiResult = await callOpenAI(params.subject, params.bodyText);
      if (aiResult) {
        const agrees = aiResult.classification === rulesClass;
        aiOverlay = {
          classification: aiResult.classification,
          confidence: aiResult.confidence,
          agrees,
          phrases: aiResult.phrases,
          provider: "openai",
          reasoning: aiResult.reasoning,
        };

        if (agrees) {
          finalConfidence = Math.min(0.98, finalConfidence + 0.1);
        } else if (aiResult.confidence > rulesConfidence) {
          finalClass = aiResult.classification;
          finalConfidence = aiResult.confidence;
        }
      }
    } catch (err) {
      console.error("OpenAI classification failed, falling back to rules-based:", err);
    }
  }

  return {
    rulesBased,
    aiOverlay,
    final: { classification: finalClass, confidence: finalConfidence },
  };
}

/** Call Google Gemini for structured email classification. */
async function callGemini(
  subject: string,
  bodyText: string,
): Promise<{
  classification: ThreatClass;
  confidence: number;
  phrases: string[];
  reasoning?: string;
} | null> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) return null;

  const truncatedBody = bodyText.slice(0, 4000);
  const preferredModel = process.env["GEMINI_MODEL"] || "gemini-3.6-flash";
  const modelsToTry = [
    preferredModel,
    "gemini-3.6-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
  ];
  const uniqueModels = [...new Set(modelsToTry)];

  const systemInstruction = `You are a specialized Business Email Compromise (BEC) and email fraud intelligence classifier.
Analyze the email subject and body carefully. Classify the threat intent into exactly one of these five classes:
- invoice_fraud: Payment diversion, banking account change requests, fraudulent invoices, updated wiring instructions
- ceo_impersonation: Executive impersonation, urgent executive wire/gift card demands, confidential acquisition requests
- credential_phishing: Fake login portals, Microsoft 365 / Okta session expiration lures, password reset scams
- malware_delivery: Suspicious macro-enabled attachments, malicious payloads, invoice.exe, script delivery
- benign: Legitimate corporate correspondence, normal billing notices with established procedures

Return ONLY a valid JSON object matching this schema:
{
  "classification": "invoice_fraud" | "ceo_impersonation" | "credential_phishing" | "malware_delivery" | "benign",
  "confidence": 0.0 to 1.0,
  "top_phrases": ["key phrase 1", "key phrase 2"],
  "reasoning": "brief 1-2 sentence forensic reasoning"
}`;

  const userContent = `Subject: ${subject}\n\nBody:\n${truncatedBody}`;

  for (const modelName of uniqueModels) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: userContent }],
              },
            ],
            systemInstruction: {
              parts: [{ text: systemInstruction }],
            },
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 1024,
              responseMimeType: "application/json",
            },
          }),
        },
      );

      if (!response.ok) {
        if (response.status === 404 && modelName !== uniqueModels[uniqueModels.length - 1]) {
          continue; // Try next fallback model
        }
        const errText = await response.text().catch(() => "");
        console.error(`Gemini API error (${modelName} ${response.status}):`, errText.slice(0, 200));
        return null;
      }

      const data = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };

      const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!rawJson) return null;

      const parsed = JSON.parse(rawJson) as {
        classification?: string;
        confidence?: number;
        top_phrases?: string[];
        reasoning?: string;
      };

      const classification = parsed.classification as ThreatClass;
      if (!THREAT_CLASSES.includes(classification)) {
        console.warn(`Gemini returned unrecognized classification: ${classification}`);
        return null;
      }

      return {
        classification,
        confidence: Math.max(
          0,
          Math.min(1, typeof parsed.confidence === "number" ? parsed.confidence : 0.88),
        ),
        phrases: Array.isArray(parsed.top_phrases) ? parsed.top_phrases.slice(0, 5) : [],
        reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : undefined,
      };
    } catch (err) {
      console.warn(`Attempt with Gemini model ${modelName} failed:`, err);
    }
  }

  return null;
}

/** Call GPT-4o-mini for structured email classification. */
async function callOpenAI(
  subject: string,
  bodyText: string,
): Promise<{
  classification: ThreatClass;
  confidence: number;
  phrases: string[];
  reasoning?: string;
} | null> {
  const truncatedBody = bodyText.slice(0, 3000);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env["OPENAI_API_KEY"]}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content: `You are a Business Email Compromise (BEC) classifier. Classify the email intent as exactly one of: invoice_fraud, ceo_impersonation, credential_phishing, malware_delivery, benign.

Return ONLY valid JSON: {"classification":"<one of the five>","confidence":<0.0 to 1.0>,"top_phrases":["phrase1","phrase2","phrase3"],"reasoning":"<brief explanation>"}

- invoice_fraud: Payment diversion, bank account changes, invoice modification
- ceo_impersonation: Executive impersonation requesting urgent wire/payment
- credential_phishing: Fake login pages, password resets, account verification
- malware_delivery: Suspicious attachments, executable files, macros
- benign: Legitimate business communication`,
        },
        {
          role: "user",
          content: `Subject: ${subject}\n\nBody:\n${truncatedBody}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error(`OpenAI API returned ${response.status}`);
    return null;
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const rawContent = data.choices?.[0]?.message?.content?.trim();
  if (!rawContent) return null;
  const content = rawContent.replace(/^```(json)?|```$/gi, "").trim();

  try {
    const parsed = JSON.parse(content) as {
      classification?: string;
      confidence?: number;
      top_phrases?: string[];
      reasoning?: string;
    };
    const classification = parsed.classification as ThreatClass;
    if (!THREAT_CLASSES.includes(classification)) return null;
    return {
      classification,
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
      phrases: Array.isArray(parsed.top_phrases) ? parsed.top_phrases.slice(0, 5) : [],
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : undefined,
    };
  } catch {
    console.error("Failed to parse OpenAI response as JSON:", content);
    return null;
  }
}
