import PDFDocument from "pdfkit";
import type { Case } from "../types.js";

export function generateForensicPdf(kase: Case): Promise<Buffer> {
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

      doc
        .fillColor("#4F8CFF")
        .font("Helvetica-Bold")
        .fontSize(16)
        .text("SENTINELMAIL", 55, 48);

      doc
        .fillColor("#98A6BA")
        .font("Helvetica")
        .fontSize(9)
        .text("Forensic Incident Report", 165, 51);

      doc
        .fillColor("#F4F7FB")
        .fontSize(8)
        .text(`Case Ref: ${kase.case_number}`, 420, 50, {
          width: 125,
          align: "right",
        });

      doc
        .fillColor("#98A6BA")
        .fontSize(7)
        .text(new Date().toUTCString(), 350, 63, {
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

    function textHeight(
      text: string,
      width: number,
      font: string,
      size: number,
      lineGap = 0,
    ) {
      doc.font(font).fontSize(size);

      return doc.heightOfString(text || "", {
        width,
        lineGap,
      });
    }

    function drawFooter() {
      const range = doc.bufferedPageRange();

      for (
        let i = range.start;
        i < range.start + range.count;
        i++
      ) {
        doc.switchToPage(i);

        doc
          .font("Helvetica")
          .fontSize(7)
          .fillColor("#9CA3AF")
          .text(
            "SentinelMail AI-Assisted BEC Investigation & Containment Platform  •  CONFIDENTIAL",
            40,
            780,
            {
              width: TEXT_WIDTH,
              align: "center",
            },
          );
      }
    }

    // ============================================================
    // PAGE 1
    // ============================================================

    header();

    let y = 105;

    // ============================================================
    // SUBJECT
    // ============================================================

    const subject = kase.subject || "Untitled Case";

    const subjectH = textHeight(
      subject,
      TEXT_WIDTH,
      "Helvetica-Bold",
      14,
      2,
    );

    y = ensureSpace(y, subjectH + 15);

    doc
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .fontSize(14)
      .text(subject, LEFT, y, {
        width: TEXT_WIDTH,
        lineGap: 2,
      });

    y += subjectH + 12;

    // ============================================================
    // RISK / THREAT / STATUS
    // ============================================================

    const riskText =
      `RISK SCORE: ${kase.risk_score}/100 (${kase.severity.toUpperCase()})`;

    const threatText =
      `Threat: ${kase.threat_class.replace(/_/g, " ").toUpperCase()}`;

    const statusText =
      `Status: ${(kase.decision || "pending").toUpperCase()}`;

    doc
      .fillColor(severityColors[kase.severity] || "#4F8CFF")
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(riskText, LEFT, y, {
        width: TEXT_WIDTH,
      });

    y += 15;

    doc
      .fillColor("#4B5563")
      .font("Helvetica")
      .fontSize(8.5)
      .text(threatText, LEFT, y, {
        width: TEXT_WIDTH,
      });

    y += 14;

    doc.text(statusText, LEFT, y, {
      width: TEXT_WIDTH,
    });

    y += 22;

    // ============================================================
    // ACTION BANNER
    // ============================================================

    const actionText =
      `ACTION: ${kase.assigned_action ?? "Review required"} — ` +
      `${kase.decision_banner ?? "Investigate the evidence before acting."}`;

    const actionH = textHeight(
      actionText,
      TEXT_WIDTH - 20,
      "Helvetica-Bold",
      8.5,
      2,
    );

    const bannerH = actionH + 16;

    y = ensureSpace(y, bannerH + 12);

    doc
      .roundedRect(LEFT, y, WIDTH, bannerH, 4)
      .fill("#F3F4F6");

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

    if (
      kase.assigned_action === "Hold payment" ||
      kase.severity === "critical"
    ) {
      const bankSuffix =
        kase.evidence?.financial?.bank_account_last4 ?? "XXXX";

      const protocolText = [
        "1. Place payment hold in accounting system on voucher.",
        "2. Call known vendor contact at verified telephone number (not the number in the email).",
        `3. Add bank suffix (••••${bankSuffix}) to enterprise blocklist across banking rails.`,
      ].join("\n");

      const protocolBodyH = textHeight(
        protocolText,
        TEXT_WIDTH - 16,
        "Helvetica",
        7.5,
        2,
      );

      const protocolH = protocolBodyH + 34;

      y = ensureSpace(y, protocolH + 12);

      doc
        .roundedRect(LEFT, y, WIDTH, protocolH, 4)
        .fillAndStroke("#FEF2F2", "#FECDD3");

      doc
        .fillColor("#991B1B")
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .text(
          "IMMEDIATE ACTIONABLE FINANCE CONTAINMENT PROTOCOL (AP TEAM)",
          LEFT + 8,
          y + 7,
          {
            width: TEXT_WIDTH - 16,
          },
        );

      doc
        .fillColor("#1F2937")
        .font("Helvetica")
        .fontSize(7.5)
        .text(protocolText, LEFT + 8, y + 21, {
          width: TEXT_WIDTH - 16,
          lineGap: 2,
        });

      y += protocolH + 14;
    }

    // ============================================================
    // SENDER / FINANCIAL
    // ============================================================

    const boxH = 82;

    y = ensureSpace(y, boxH + 12);

    const senderX = LEFT;
    const financialX = LEFT + 265;
    const boxW = 250;

    doc
      .roundedRect(senderX, y, boxW, boxH, 3)
      .stroke("#E5E7EB");

    doc
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("Sender & Routing", senderX + 8, y + 8);

    const senderInfo = [
      `From: ${kase.sender || "—"}`,
      `Reply-To: ${
        kase.evidence?.sender_identity?.reply_to ?? "Same as From"
      }`,
      `SPF: ${(
        kase.evidence?.sender_identity?.auth?.spf ?? "none"
      ).toUpperCase()}`,
      `DKIM: ${(
        kase.evidence?.sender_identity?.auth?.dkim ?? "none"
      ).toUpperCase()}`,
      `DMARC: ${(
        kase.evidence?.sender_identity?.auth?.dmarc ?? "none"
      ).toUpperCase()}`,
    ].join("\n");

    doc
      .fillColor("#4B5563")
      .font("Helvetica")
      .fontSize(8)
      .text(senderInfo, senderX + 8, y + 25, {
        width: boxW - 16,
        lineGap: 2,
      });

    doc
      .roundedRect(financialX, y, boxW, boxH, 3)
      .stroke("#E5E7EB");

    doc
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("Financial Exposure", financialX + 8, y + 8);

    const amountText = kase.amount_at_risk
      ? `$${kase.amount_at_risk.toLocaleString()} ${
          kase.currency ?? "USD"
        }`
      : "Not detected";

    const bankText =
      kase.evidence?.financial?.bank_account_last4
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
        ].join("\n"),
        financialX + 8,
        y + 25,
        {
          width: boxW - 16,
          lineGap: 3,
        },
      );

    y += boxH + 18;

    // ============================================================
    // EVIDENCE TIMELINE
    // ============================================================

    y = ensureSpace(y, 40);

    doc
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(
        "Evidence Timeline & Behavioral Findings",
        LEFT,
        y,
      );

    y += 20;

    const timeline = kase.timeline ?? [];

    for (const item of timeline.slice(0, 8)) {
      const title = item.title || "Finding";
      const description = item.description || "";

      const titleH = textHeight(
        title,
        TEXT_WIDTH - 25,
        "Helvetica-Bold",
        8.5,
      );

      const descH = textHeight(
        description,
        TEXT_WIDTH - 25,
        "Helvetica",
        7.5,
        1.5,
      );

      const itemH = titleH + descH + 12;

      if (y + itemH > PAGE_BOTTOM) {
        y = newPage();

        doc
          .fillColor("#111827")
          .font("Helvetica-Bold")
          .fontSize(11)
          .text(
            "Evidence Timeline & Behavioral Findings",
            LEFT,
            y,
          );

        y += 20;
      }

      const dotColor =
        severityColors[item.severity] || "#6B7280";

      doc
        .circle(46, y + 4, 3)
        .fill(dotColor);

      doc
        .fillColor("#111827")
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .text(title, 56, y, {
          width: TEXT_WIDTH - 25,
        });

      y += titleH + 2;

      doc
        .fillColor("#4B5563")
        .font("Helvetica")
        .fontSize(7.5)
        .text(description, 56, y, {
          width: TEXT_WIDTH - 25,
          lineGap: 1.5,
        });

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

      const bodyTextH = textHeight(
        previewText,
        TEXT_WIDTH - 16,
        "Courier",
        7.5,
        2,
      );

      const bodyBoxH = bodyTextH + 20;

      if (y + bodyBoxH + 30 > PAGE_BOTTOM) {
        y = newPage();
      }

      doc
        .fillColor("#111827")
        .font("Helvetica-Bold")
        .fontSize(10)
        .text("Message Body Preview", LEFT, y);

      y += 16;

      doc
        .roundedRect(LEFT, y, WIDTH, bodyBoxH, 3)
        .fill("#F9FAFB");

      doc
        .fillColor("#374151")
        .font("Courier")
        .fontSize(7.5)
        .text(previewText, LEFT + 8, y + 9, {
          width: TEXT_WIDTH - 16,
          lineGap: 2,
        });

      y += bodyBoxH + 10;
    }

    drawFooter();

    doc.end();
  });
}




// import PDFDocument from "pdfkit";
// import type { Case } from "../types.js";

// export function generateForensicPdf(kase: Case): Promise<Buffer> {
//   return new Promise((resolve, reject) => {
//     try {
//       const doc = new PDFDocument({ margin: 40, size: "A4" });
//       const buffers: Buffer[] = [];

//       doc.on("data", (chunk: Buffer) => buffers.push(chunk));
//       doc.on("end", () => resolve(Buffer.concat(buffers)));
//       doc.on("error", (err: Error) => reject(err));

//       // ── Header Bar ──
//       doc.rect(40, 40, 515, 45).fill("#080D17");
//       doc
//         .fillColor("#4F8CFF")
//         .fontSize(16)
//         .font("Helvetica-Bold")
//         .text("SENTINELMAIL", 55, 48, { continued: true })
//         .fillColor("#98A6BA")
//         .fontSize(10)
//         .font("Helvetica")
//         .text("   |   Forensic Incident Report", { align: "left" });

//       doc
//         .fillColor("#F4F7FB")
//         .fontSize(9)
//         .font("Helvetica")
//         .text(`Case Ref: ${kase.case_number}`, 420, 50, { align: "right" });
//       doc
//         .fillColor("#98A6BA")
//         .fontSize(8)
//         .text(new Date().toUTCString(), 420, 62, { align: "right" });

//       doc.moveDown(3);

//       // ── Overview Section ──
//       const severityColors: Record<string, string> = {
//         critical: "#FB5465",
//         high: "#F6B44C",
//         medium: "#F6B44C",
//         safe: "#33C481",
//       };
//       const sevColor = severityColors[kase.severity] || "#4F8CFF";

//       doc
//         .fillColor("#111827")
//         .fontSize(14)
//         .font("Helvetica-Bold")
//         .text(kase.subject, 40, 105, { width: 515 });

//       doc.moveDown(0.5);
//       doc
//         .fillColor(sevColor)
//         .fontSize(10)
//         .font("Helvetica-Bold")
//         .text(`RISK SCORE: ${kase.risk_score}/100 (${kase.severity.toUpperCase()})`, {
//           continued: true,
//         })
//         .fillColor("#4B5563")
//         .font("Helvetica")
//         .text(`   •   Threat: ${kase.threat_class.replace(/_/g, " ").toUpperCase()}`, {
//           continued: true,
//         })
//         .text(`   •   Status: ${kase.decision.toUpperCase()}`);

//       doc.moveDown(0.8);
//       // Decision Banner Box
//       doc.rect(40, doc.y, 515, 24).fill("#F3F4F6");
//       doc
//         .fillColor("#1F2937")
//         .fontSize(8.5)
//         .font("Helvetica-Bold")
//         .text(
//           `ACTION: ${kase.assigned_action ?? "Review required"} — ${kase.decision_banner}`,
//           50,
//           doc.y - 18,
//           { width: 495 },
//         );

//       doc.moveDown(1.0);

//       // ── Immediate AP Containment Protocol Box ──
//       if (kase.assigned_action === "Hold payment" || kase.severity === "critical") {
//         const bankSuffix =
//           kase.evidence?.financial?.bank_account_last4 ??
//           (kase.case_number === "SM-1037" ? "5518" : "XXXX");
//         const protoBoxY = doc.y;
//         doc.rect(40, protoBoxY, 515, 54).fillAndStroke("#FEF2F2", "#FECDD3");
//         doc
//           .fillColor("#991B1B")
//           .fontSize(8.5)
//           .font("Helvetica-Bold")
//           .text("IMMEDIATE ACTIONABLE FINANCE CONTAINMENT PROTOCOL (AP TEAM)", 48, protoBoxY + 6, {
//             width: 495,
//           });
//         doc
//           .fillColor("#1F2937")
//           .fontSize(7.5)
//           .font("Helvetica")
//           .text("1. Place payment hold in accounting system on voucher.", 48, protoBoxY + 18, {
//             width: 495,
//           })
//           .text(
//             "2. Call known vendor contact at verified telephone number (not the number in the email).",
//             48,
//             protoBoxY + 30,
//             { width: 495 },
//           )
//           .text(
//             `3. Add bank suffix (••••${bankSuffix}) to enterprise blocklist across banking rails.`,
//             48,
//             protoBoxY + 42,
//             { width: 495 },
//           );
//         doc.y = protoBoxY + 60;
//       }

//       // ── Target & Financial Exposure ──
//       const startY = doc.y;
//       doc.rect(40, startY, 250, 75).stroke("#E5E7EB");
//       doc
//         .fillColor("#111827")
//         .fontSize(10)
//         .font("Helvetica-Bold")
//         .text("Sender & Routing", 48, startY + 8);
//       doc
//         .fillColor("#4B5563")
//         .fontSize(8.5)
//         .font("Helvetica")
//         .text(`From: ${kase.sender}`, 48, startY + 24, { width: 235 })
//         .text(
//           `Reply-To: ${kase.evidence?.sender_identity?.reply_to ?? "Same as From"}`,
//           48,
//           startY + 38,
//           { width: 235 },
//         )
//         .text(
//           `SPF: ${(kase.evidence?.sender_identity?.auth?.spf ?? "none").toUpperCase()}   DKIM: ${(kase.evidence?.sender_identity?.auth?.dkim ?? "none").toUpperCase()}   DMARC: ${(kase.evidence?.sender_identity?.auth?.dmarc ?? "none").toUpperCase()}`,
//           48,
//           startY + 52,
//         );

//       doc.rect(305, startY, 250, 75).stroke("#E5E7EB");
//       doc
//         .fillColor("#111827")
//         .fontSize(10)
//         .font("Helvetica-Bold")
//         .text("Financial Exposure", 313, startY + 8);
//       doc
//         .fillColor("#4B5563")
//         .fontSize(8.5)
//         .font("Helvetica")
//         .text(`Vendor: ${kase.vendor ?? "—"}`, 313, startY + 24)
//         .text(
//           `Amount at Risk: ${kase.amount_at_risk ? `$${kase.amount_at_risk.toLocaleString()} ${kase.currency ?? "USD"}` : "Not detected"}`,
//           313,
//           startY + 38,
//         )
//         .text(
//           `Bank Account: ${kase.evidence?.financial?.bank_account_last4 ? `Ending ••••${kase.evidence.financial.bank_account_last4}` : "None detected"}`,
//           313,
//           startY + 52,
//         );

//       doc.y = startY + 90;

//       // ── Evidence Timeline ──
//       doc
//         .fillColor("#111827")
//         .fontSize(11)
//         .font("Helvetica-Bold")
//         .text("Evidence Timeline & Behavioral Findings", 40, doc.y);
//       doc.moveDown(0.4);

//       const timeline = kase.timeline ?? [];
//       for (const item of timeline.slice(0, 8)) {
//         const itemColor = severityColors[item.severity] || "#6B7280";
//         doc.circle(46, doc.y + 4, 3).fill(itemColor);
//         doc
//           .fillColor("#111827")
//           .fontSize(9)
//           .font("Helvetica-Bold")
//           .text(item.title, 56, doc.y, { width: 490 });
//         doc
//           .fillColor("#4B5563")
//           .fontSize(8)
//           .font("Helvetica")
//           .text(item.description, 56, doc.y + 1, { width: 490 });
//         doc.moveDown(0.4);
//       }

//       // ── Email Body Preview ──
//       doc.moveDown(0.8);
//       if (doc.y < 680 && kase.body_preview) {
//         doc
//           .fillColor("#111827")
//           .fontSize(10)
//           .font("Helvetica-Bold")
//           .text("Message Body Preview", 40, doc.y);
//         doc.moveDown(0.3);
//         const previewText =
//           kase.body_preview.slice(0, 450) + (kase.body_preview.length > 450 ? "..." : "");
//         doc.rect(40, doc.y, 515, 65).fill("#F9FAFB");
//         doc
//           .fillColor("#374151")
//           .fontSize(8)
//           .font("Courier")
//           .text(previewText, 48, doc.y - 58, { width: 495 });
//       }

//       // ── Footer ──
//       doc
//         .fontSize(7.5)
//         .font("Helvetica")
//         .fillColor("#9CA3AF")
//         .text(
//           "SentinelMail AI-Assisted BEC Investigation & Containment Platform  •  CONFIDENTIAL",
//           40,
//           780,
//           { align: "center", width: 515 },
//         );

//       doc.end();
//     } catch (err) {
//       reject(err);
//     }
//   });
// }
