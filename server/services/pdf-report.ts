import PDFDocument from "pdfkit";
import type { Case } from "../types.js";

export function generateForensicPdf(inputCase: Case): Promise<Buffer> {
  const safeParse = (val: any, fallback: any) => {
    if (!val) return fallback;
    if (typeof val === "object") return val;
    if (typeof val === "string") {
      try {
        return JSON.parse(val);
      } catch {
        return fallback;
      }
    }
    return fallback;
  };

  const kase: Case = {
    ...inputCase,
    evidence: safeParse(inputCase.evidence, {}),
    timeline: safeParse(inputCase.timeline, []),
    relay_path: safeParse(inputCase.relay_path, []),
    actions: safeParse(inputCase.actions, []),
  };

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
      bufferPages: true,
    });

    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const PAGE_W = 515;
    const LEFT = 40;
    const WIDTH = 515;
    const TEXT_WIDTH = 495;
    const PAGE_BOTTOM = 735;

    const severityColors: Record<string, string> = {
      critical: "#FB5465",
      high: "#F6B44C",
      medium: "#F6B44C",
      safe: "#33C481",
    };

    function header() {
      doc.rect(40, 40, PAGE_W, 45).fill("#080D17");

      doc.fillColor("#4F8CFF").font("Helvetica-Bold").fontSize(16).text("SENTINELMAIL", 55, 48);

      doc
        .fillColor("#98A6BA")
        .font("Helvetica")
        .fontSize(9)
        .text("Forensic Incident Report", 165, 51);

      doc.fillColor("#F4F7FB").fontSize(8).text(`Case Ref: ${kase.case_number}`, 420, 50, {
        width: 125,
        align: "right",
      });

      doc.fillColor("#98A6BA").fontSize(7).text(new Date().toUTCString(), 350, 63, {
        width: 195,
        align: "right",
      });
    }

    function newPage() {
      doc.addPage();
      header();
      return 105;
    }

    function ensureSpace(y: number, required: number) {
      if (y + required > PAGE_BOTTOM) {
        return newPage();
      }
      return y;
    }

    function textHeight(text: string, width: number, font: string, size: number, lineGap = 0) {
      doc.font(font).fontSize(size);
      return doc.heightOfString(text || "", { width, lineGap });
    }

    function drawFooter() {
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc
          .font("Helvetica")
          .fontSize(7)
          .fillColor("#9CA3AF")
          .text(
            "SentinelMail AI-Assisted BEC Investigation & Containment Platform  •  CONFIDENTIAL",
            40,
            780,
            { width: TEXT_WIDTH, align: "center" },
          );
      }
    }

    // ============================================================
    // PAGE 1
    // ============================================================

    header();
    let y = 105;

    const subject = kase.subject || "Untitled Case";
    const subjectH = textHeight(subject, TEXT_WIDTH, "Helvetica-Bold", 14, 2);
    y = ensureSpace(y, subjectH + 15);
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(14).text(subject, LEFT, y, {
      width: TEXT_WIDTH,
      lineGap: 2,
    });
    y += subjectH + 12;

    // ============================================================
    // ACTION BANNER
    // ============================================================
    const actionText = `ACTION: ${kase.assigned_action ?? "Review required"} — ${kase.decision_banner ?? "Investigate the evidence before acting."}`;
    const actionH = textHeight(actionText, TEXT_WIDTH - 20, "Helvetica-Bold", 8.5, 2);
    const bannerH = actionH + 16;
    y = ensureSpace(y, bannerH + 12);
    doc.roundedRect(LEFT, y, WIDTH, bannerH, 4).fill("#F3F4F6");
    doc
      .fillColor("#1F2937")
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .text(actionText, LEFT + 10, y + 8, {
        width: TEXT_WIDTH - 20,
        lineGap: 2,
      });
    y += bannerH + 14;

    // ============================================================
    // FINANCE CONTAINMENT PROTOCOL
    // ============================================================
    if (kase.assigned_action === "Hold payment" || kase.severity === "critical") {
      const bankSuffix = kase.evidence?.financial?.bank_account_last4 ?? "XXXX";
      const protocolText = [
        "1. Place payment hold in accounting system on voucher.",
        "2. Call known vendor contact at verified telephone number (not the number in the email).",
        `3. Add bank suffix (••••${bankSuffix}) to enterprise blocklist across banking rails.`,
      ].join("\n");
      const protocolBodyH = textHeight(protocolText, TEXT_WIDTH - 16, "Helvetica", 7.5, 2);
      const protocolH = protocolBodyH + 34;
      y = ensureSpace(y, protocolH + 12);
      doc.roundedRect(LEFT, y, WIDTH, protocolH, 4).fillAndStroke("#FEF2F2", "#FECDD3");
      doc
        .fillColor("#991B1B")
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .text("IMMEDIATE ACTIONABLE FINANCE CONTAINMENT PROTOCOL (AP TEAM)", LEFT + 8, y + 7, {
          width: TEXT_WIDTH - 16,
        });
      doc
        .fillColor("#1F2937")
        .font("Helvetica")
        .fontSize(7.5)
        .text(protocolText, LEFT + 8, y + 21, { width: TEXT_WIDTH - 16, lineGap: 2 });
      y += protocolH + 14;
    }

    // ============================================================
    // 1. THREAT ASSESSMENT & 2. SENDER AUTHENTICATION
    // ============================================================
    const boxH = 90;
    y = ensureSpace(y, boxH + 12);
    const senderX = LEFT;
    const threatX = LEFT + 265;
    const boxW = 250;

    // Threat Assessment Box
    doc.roundedRect(threatX, y, boxW, boxH, 3).stroke("#E5E7EB");
    doc
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("Threat Assessment", threatX + 8, y + 8);
    const threatInfo = [
      `Verdict: ${kase.threat_class.replace(/_/g, " ").toUpperCase()}`,
      `Risk Score: ${kase.risk_score}/100 (${kase.severity.toUpperCase()})`,
      `Status: ${(kase.decision || "pending").toUpperCase()}`,
      `Reasons: ${kase.evidence?.behavioral?.flags && kase.evidence.behavioral.flags.length > 0 ? kase.evidence.behavioral.flags.join(", ") : "None specified"}`,
    ].join("\n");
    doc
      .fillColor("#4B5563")
      .font("Helvetica")
      .fontSize(8)
      .text(threatInfo, threatX + 8, y + 25, { width: boxW - 16, lineGap: 2 });

    // Sender Authentication Box
    doc.roundedRect(senderX, y, boxW, boxH, 3).stroke("#E5E7EB");
    doc
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("Sender Authentication", senderX + 8, y + 8);
    const senderInfo = [
      `From: ${kase.sender || "—"}`,
      `SPF: ${(kase.evidence?.sender_identity?.auth?.spf ?? "Unavailable").toUpperCase()}`,
      `DKIM: ${(kase.evidence?.sender_identity?.auth?.dkim ?? "Unavailable").toUpperCase()}`,
      `DMARC: ${(kase.evidence?.sender_identity?.auth?.dmarc ?? "Unavailable").toUpperCase()}`,
      `Alignment: ${(kase.evidence?.sender_identity?.domain_alignment ?? "Unavailable").toUpperCase()}`,
    ].join("\n");
    doc
      .fillColor("#4B5563")
      .font("Helvetica")
      .fontSize(8)
      .text(senderInfo, senderX + 8, y + 25, { width: boxW - 16, lineGap: 2 });

    y += boxH + 14;

    // ============================================================
    // 5. PROBABLE INFRASTRUCTURE ORIGIN
    // ============================================================
    if (kase.origin_assessment) {
      const originH = 60;
      y = ensureSpace(y, originH + 12);
      doc.roundedRect(LEFT, y, WIDTH, originH, 3).stroke("#E5E7EB");
      doc
        .fillColor("#111827")
        .font("Helvetica-Bold")
        .fontSize(10)
        .text("Probable Infrastructure Origin", LEFT + 8, y + 8);
      const originText = [
        `Assessment: ${kase.origin_assessment.assessment} (${kase.origin_assessment.confidence}% Confidence)`,
        `Evidence: ${kase.origin_assessment.reasons.length > 0 ? kase.origin_assessment.reasons.join(" | ") : "Unavailable"}`,
      ].join("\n");
      doc
        .fillColor("#4B5563")
        .font("Helvetica")
        .fontSize(8)
        .text(originText, LEFT + 8, y + 25, { width: WIDTH - 16, lineGap: 2 });
      y += originH + 14;
    }

    // ============================================================
    // FINANCIAL EXPOSURE
    // ============================================================
    const finH = 65;
    y = ensureSpace(y, finH + 12);
    doc.roundedRect(LEFT, y, WIDTH, finH, 3).stroke("#E5E7EB");
    doc
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("Financial Exposure", LEFT + 8, y + 8);
    const amountText = kase.amount_at_risk
      ? `$${kase.amount_at_risk.toLocaleString()} ${kase.currency ?? "USD"}`
      : "Not detected";
    const bankText = kase.evidence?.financial?.bank_account_last4
      ? `Ending ••••${kase.evidence.financial.bank_account_last4}`
      : "None detected";
    doc
      .fillColor("#4B5563")
      .font("Helvetica")
      .fontSize(8)
      .text(
        [
          `Vendor: ${kase.vendor ?? "—"}`,
          `Amount at Risk: ${amountText}`,
          `Bank Account: ${bankText}`,
        ].join("  |  "),
        LEFT + 8,
        y + 25,
        { width: WIDTH - 16, lineGap: 3 },
      );
    y += finH + 18;

    // ============================================================
    // 3. RELAY / INFRASTRUCTURE TRACE
    // ============================================================
    if (kase.relay_path && kase.relay_path.length > 0) {
      y = ensureSpace(y, 30);
      doc
        .fillColor("#111827")
        .font("Helvetica-Bold")
        .fontSize(11)
        .text("Relay / Infrastructure Trace", LEFT, y);
      y += 18;

      const publicRelays = kase.relay_path.filter((r) => r.is_public);
      if (publicRelays.length === 0) {
        doc
          .fillColor("#4B5563")
          .font("Helvetica")
          .fontSize(8)
          .text("No public relays detected.", LEFT, y);
        y += 15;
      } else {
        for (const [idx, r] of publicRelays.entries()) {
          const text = `Hop ${idx + 1}: ${r.ip} | ${r.timestamp || "Unavailable"} | ${r.country || "Unavailable"} (${r.countryCode || "-"}) | ASN: ${r.asn || "Unavailable"} | ${r.organization || "Unavailable"}`;
          y = ensureSpace(y, 15);
          doc.fillColor("#4B5563").font("Helvetica").fontSize(8).text(text, LEFT, y);
          y += 12;
        }
      }
      y += 10;
    }

    // ============================================================
    // 4. DOMAIN INTELLIGENCE
    // ============================================================
    if (kase.domain_intelligence && kase.domain_intelligence.length > 0) {
      y = ensureSpace(y, 30);
      doc
        .fillColor("#111827")
        .font("Helvetica-Bold")
        .fontSize(11)
        .text("Domain Intelligence", LEFT, y);
      y += 18;

      for (const di of kase.domain_intelligence) {
        const textH = 45;
        y = ensureSpace(y, textH + 5);
        doc.fillColor("#111827").font("Helvetica-Bold").fontSize(9).text(di.domain, LEFT, y);
        const diText = [
          `Registrar: ${di.registrar || "Unavailable"} | Created: ${di.creation_date ? di.creation_date.substring(0, 10) : "Unavailable"} | Expires: ${di.expiration_date ? di.expiration_date.substring(0, 10) : "Unavailable"} | Age: ${di.age_days ? di.age_days + " days" : "Unavailable"}`,
          `A: ${di.a_records.length ? di.a_records.join(", ") : "Unavailable"} | AAAA: ${di.aaaa_records.length ? di.aaaa_records.join(", ") : "Unavailable"}`,
          `MX: ${di.mx_records.length ? di.mx_records.join(", ") : "Unavailable"} | NS: ${di.ns_records.length ? di.ns_records.join(", ") : "Unavailable"}`,
        ].join("\n");
        doc
          .fillColor("#4B5563")
          .font("Helvetica")
          .fontSize(8)
          .text(diText, LEFT, y + 12, { lineGap: 1.5 });
        y += textH + 8;
      }
      y += 5;
    }

    // ============================================================
    // EVIDENCE TIMELINE
    // ============================================================
    y = ensureSpace(y, 40);
    doc
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("Evidence Timeline & Behavioral Findings", LEFT, y);
    y += 20;

    const timeline = kase.timeline ?? [];
    for (const item of timeline.slice(0, 8)) {
      const title = item.title || "Finding";
      const description = item.description || "";
      const titleH = textHeight(title, TEXT_WIDTH - 25, "Helvetica-Bold", 8.5);
      const descH = textHeight(description, TEXT_WIDTH - 25, "Helvetica", 7.5, 1.5);
      const itemH = titleH + descH + 12;

      y = ensureSpace(y, itemH);

      const dotColor = severityColors[item.severity] || "#6B7280";
      doc.circle(46, y + 4, 3).fill(dotColor);
      doc
        .fillColor("#111827")
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .text(title, 56, y, { width: TEXT_WIDTH - 25 });
      y += titleH + 2;
      doc
        .fillColor("#4B5563")
        .font("Helvetica")
        .fontSize(7.5)
        .text(description, 56, y, { width: TEXT_WIDTH - 25, lineGap: 1.5 });
      y += descH + 10;
    }

    // ============================================================
    // MESSAGE BODY
    // ============================================================
    if (kase.body_preview) {
      const previewText =
        kase.body_preview.length > 700
          ? kase.body_preview.slice(0, 700) + "..."
          : kase.body_preview;
      const bodyTextH = textHeight(previewText, TEXT_WIDTH - 16, "Courier", 7.5, 2);
      const bodyBoxH = bodyTextH + 20;

      y = ensureSpace(y, bodyBoxH + 30);
      doc
        .fillColor("#111827")
        .font("Helvetica-Bold")
        .fontSize(10)
        .text("Message Body Preview", LEFT, y);
      y += 16;
      doc.roundedRect(LEFT, y, WIDTH, bodyBoxH, 3).fill("#F9FAFB");
      doc
        .fillColor("#374151")
        .font("Courier")
        .fontSize(7.5)
        .text(previewText, LEFT + 8, y + 9, { width: TEXT_WIDTH - 16, lineGap: 2 });
      y += bodyBoxH + 10;
    }

    drawFooter();
    doc.end();
  });
}
