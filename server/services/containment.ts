import nodemailer from "nodemailer";

/**
 * Send containment alerts when an analyst takes a Hold Payment or other critical action.
 * Supports webhook, Slack, Teams, and email channels. Failures are logged but never thrown.
 */
export async function sendContainmentAlert(params: {
  caseNumber: string;
  subject: string;
  sender: string;
  riskScore: number;
  severity: string;
  vendor?: string;
  amountAtRisk?: number;
  currency?: string;
  decisionBanner: string;
  actionType: string;
  analystNote?: string;
  caseUrl?: string;
}): Promise<{ sent: string[] }> {
  const sent: string[] = [];

  // 1. Generic webhook
  if (process.env["CONTAINMENT_WEBHOOK_URL"]) {
    try {
      const res = await fetch(process.env["CONTAINMENT_WEBHOOK_URL"], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8_000),
        body: JSON.stringify({
          event: "containment_action",
          case_number: params.caseNumber,
          subject: params.subject,
          sender: params.sender,
          risk_score: params.riskScore,
          severity: params.severity,
          vendor: params.vendor,
          amount_at_risk: params.amountAtRisk,
          currency: params.currency,
          action: params.actionType,
          analyst_note: params.analystNote,
          decision_banner: params.decisionBanner,
          timestamp: new Date().toISOString(),
        }),
      });
      if (res.ok) sent.push("webhook");
      else console.error(`Webhook returned ${res.status}`);
    } catch (err) {
      console.error("Webhook alert failed:", err);
    }
  }

  // 2. Slack (Block Kit)
  if (process.env["SLACK_WEBHOOK_URL"]) {
    try {
      const emoji =
        params.severity === "critical" ? "🔴" : params.severity === "high" ? "🟠" : "🟡";
      const amount = params.amountAtRisk
        ? `\n*Amount at risk:* ${params.currency ?? "USD"} ${params.amountAtRisk.toLocaleString()}`
        : "";
      const res = await fetch(process.env["SLACK_WEBHOOK_URL"], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8_000),
        body: JSON.stringify({
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: `${emoji} SentinelMail: ${params.actionType.replace(/_/g, " ").toUpperCase()}`,
              },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Case:* ${params.caseNumber}\n*Subject:* ${params.subject}\n*Sender:* ${params.sender}\n*Vendor:* ${params.vendor ?? "—"}\n*Risk:* ${params.riskScore}/100 (${params.severity})${amount}`,
              },
            },
            { type: "section", text: { type: "mrkdwn", text: `> ${params.decisionBanner}` } },
            ...(params.analystNote
              ? [
                  {
                    type: "section",
                    text: { type: "mrkdwn", text: `*Analyst note:* ${params.analystNote}` },
                  },
                ]
              : []),
          ],
        }),
      });
      if (res.ok) sent.push("slack");
      else console.error(`Slack webhook returned ${res.status}`);
    } catch (err) {
      console.error("Slack alert failed:", err);
    }
  }

  // 3. Microsoft Teams (Adaptive Card)
  if (process.env["TEAMS_WEBHOOK_URL"]) {
    try {
      const res = await fetch(process.env["TEAMS_WEBHOOK_URL"], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8_000),
        body: JSON.stringify({
          type: "message",
          attachments: [
            {
              contentType: "application/vnd.microsoft.card.adaptive",
              content: {
                $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
                type: "AdaptiveCard",
                version: "1.4",
                body: [
                  {
                    type: "TextBlock",
                    size: "Large",
                    weight: "Bolder",
                    text: `SentinelMail: ${params.actionType.replace(/_/g, " ").toUpperCase()}`,
                  },
                  {
                    type: "FactSet",
                    facts: [
                      { title: "Case", value: params.caseNumber },
                      { title: "Subject", value: params.subject },
                      { title: "Sender", value: params.sender },
                      { title: "Risk", value: `${params.riskScore}/100 (${params.severity})` },
                      ...(params.vendor ? [{ title: "Vendor", value: params.vendor }] : []),
                      ...(params.amountAtRisk
                        ? [
                            {
                              title: "Amount",
                              value: `${params.currency ?? "USD"} ${params.amountAtRisk.toLocaleString()}`,
                            },
                          ]
                        : []),
                    ],
                  },
                  {
                    type: "TextBlock",
                    text: params.decisionBanner,
                    wrap: true,
                    color: "Attention",
                  },
                ],
              },
            },
          ],
        }),
      });
      if (res.ok) sent.push("teams");
      else console.error(`Teams webhook returned ${res.status}`);
    } catch (err) {
      console.error("Teams alert failed:", err);
    }
  }

  // 4. Email via SMTP
  if (process.env["SMTP_HOST"] && process.env["SMTP_FROM"] && process.env["ALERT_EMAIL_TO"]) {
    try {
      const transport = nodemailer.createTransport({
        host: process.env["SMTP_HOST"],
        port: Number(process.env["SMTP_PORT"] ?? "587"),
        secure: (process.env["SMTP_PORT"] ?? "587") === "465",
        auth: process.env["SMTP_USER"]
          ? { user: process.env["SMTP_USER"], pass: process.env["SMTP_PASS"] }
          : undefined,
      });
      const amount = params.amountAtRisk
        ? `Amount at risk: ${params.currency ?? "USD"} ${params.amountAtRisk.toLocaleString()}\n`
        : "";
      await transport.sendMail({
        from: process.env["SMTP_FROM"],
        to: process.env["ALERT_EMAIL_TO"],
        subject: `[SentinelMail] ${params.actionType.replace(/_/g, " ").toUpperCase()} — ${params.caseNumber}`,
        text: [
          `Case: ${params.caseNumber}`,
          `Subject: ${params.subject}`,
          `Sender: ${params.sender}`,
          `Vendor: ${params.vendor ?? "—"}`,
          `Risk: ${params.riskScore}/100 (${params.severity})`,
          amount,
          params.decisionBanner,
          "",
          params.analystNote ? `Analyst note: ${params.analystNote}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      });
      sent.push("email");
    } catch (err) {
      console.error("Email alert failed:", err);
    }
  }

  if (sent.length > 0) {
    console.log(`Containment alert sent for ${params.caseNumber} via: ${sent.join(", ")}`);
  }

  return { sent };
}
