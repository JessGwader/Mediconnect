const PDFDocument = require("pdfkit");

// Starts a branded MediConnect PDF and streams it straight to the response.
// Shared by receipts, prescriptions, and referral letters so they all look
// like they come from the same real system.
function startDocument(res, { filename, subtitle }) {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);

  doc.fontSize(20).fillColor("#12233B").text("MediConnect");
  doc.fontSize(11).fillColor("#5A7797").text(subtitle).moveDown(1.5);
  doc.fillColor("#1B2A22").fontSize(10);
  return doc;
}

function footer(doc, note) {
  doc.moveDown(2);
  doc.fontSize(8).fillColor("#8B978F").text(note || "This document was generated automatically by MediConnect.");
}

module.exports = { startDocument, footer };
