const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const BASE_CURRENCY = process.env.BASE_CURRENCY || 'INR';
const BASE_SYMBOL = process.env.BASE_CURRENCY_SYMBOL || '₹';

/**
 * Generate a professional PDF audit report for a single claim.
 * Returns a readable stream.
 */
function generateClaimReport(claim, employee) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });

  const green = '#0f4f3c';
  const accent = '#1a7a5c';
  const gray = '#6b7280';
  const lightBg = '#f4f7f6';

  // ─── Header ───
  doc.rect(0, 0, doc.page.width, 90).fill(green);
  doc.fontSize(22).fillColor('#ffffff').text('AuditLens', 50, 28, { continued: true });
  doc.fontSize(22).fillColor('#5fe0b8').text(' Report');
  doc.fontSize(10).fillColor('#a0d5c4').text('Expense Intelligence — Audit Report', 50, 55);

  doc.moveDown(3);
  const y0 = doc.y;

  // ─── Claim Summary Box ───
  doc.rect(50, y0, doc.page.width - 100, 100).fill(lightBg).stroke('#ddd');
  doc.fillColor('#1a2e27').fontSize(12).text('Claim Summary', 65, y0 + 12, { underline: true });

  const statusColors = { approved: '#22c55e', flagged: '#eab308', rejected: '#ef4444' };
  const status = claim.effectiveStatus || claim.auditStatus || 'pending';

  const summaryData = [
    ['Status', status.toUpperCase()],
    ['Risk Level', (claim.riskLevel || 'low').toUpperCase()],
    ['Claim ID', claim._id?.toString() || '—'],
    ['Trip Type', (claim.tripType || 'domestic').charAt(0).toUpperCase() + (claim.tripType || 'domestic').slice(1)],
  ];

  let sy = y0 + 30;
  summaryData.forEach(([label, value], i) => {
    const x = i < 2 ? 65 : 310;
    if (i === 2) sy = y0 + 30;
    doc.fontSize(8).fillColor(gray).text(label, x, sy);
    doc.fontSize(10).fillColor(label === 'Status' ? (statusColors[status] || '#1a2e27') : '#1a2e27').text(value, x, sy + 12);
    sy += 30;
  });

  doc.y = y0 + 115;

  // ─── Employee Info ───
  doc.fontSize(12).fillColor(accent).text('Employee Information', 50);
  doc.moveDown(0.3);
  const empData = [
    ['Name', employee?.name || '—'],
    ['Email', employee?.email || '—'],
    ['Department', employee?.department || '—'],
    ['Location', employee?.location || '—'],
    ['Seniority', employee?.seniority || '—'],
    ['Compliance Score', `${employee?.complianceScore ?? '—'}%`],
  ];
  empData.forEach(([label, value]) => {
    doc.fontSize(8).fillColor(gray).text(`${label}: `, 65, doc.y, { continued: true });
    doc.fontSize(9).fillColor('#1a2e27').text(value);
  });

  doc.moveDown(1);

  // ─── Extracted Data ───
  doc.fontSize(12).fillColor(accent).text('Extracted Receipt Data', 50);
  doc.moveDown(0.3);
  const ext = claim.extractedData || {};
  const extractedRows = [
    ['Merchant', ext.merchantName || '—'],
    ['Date', ext.date ? new Date(ext.date).toLocaleDateString('en-IN') : '—'],
    ['Original Amount', `${ext.currency || 'INR'} ${ext.amount ? ext.amount.toLocaleString('en-IN') : '—'}`],
    ['Converted Amount', `${BASE_SYMBOL}${ext.amountBase ? ext.amountBase.toLocaleString('en-IN') : (ext.amount ? ext.amount.toLocaleString('en-IN') : '—')}`],
    ['Category', ext.category || '—'],
    ['OCR Confidence', ext.ocrConfidence ? `${Math.round(ext.ocrConfidence * 100)}%` : '—'],
  ];
  extractedRows.forEach(([label, value]) => {
    doc.fontSize(8).fillColor(gray).text(`${label}: `, 65, doc.y, { continued: true });
    doc.fontSize(9).fillColor('#1a2e27').text(value);
  });

  doc.moveDown(1);

  // ─── Business Purpose ───
  doc.fontSize(12).fillColor(accent).text('Business Purpose', 50);
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor('#1a2e27').text(claim.businessPurpose || '—', 65, doc.y, { width: doc.page.width - 130 });

  doc.moveDown(1);

  // ─── AI Assessment ───
  if (claim.aiExplanation) {
    doc.fontSize(12).fillColor(accent).text('AI Assessment', 50);
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#1a2e27').text(claim.aiExplanation, 65, doc.y, { width: doc.page.width - 130 });

    if (claim.policyRulesCited?.length > 0) {
      doc.moveDown(0.5);
      doc.fontSize(8).fillColor(gray).text('Policy Rules Cited:', 65);
      claim.policyRulesCited.forEach((rule) => {
        doc.fontSize(8).fillColor('#4a6b5d').text(`• "${rule}"`, 75, doc.y, { width: doc.page.width - 145 });
      });
    }
  }

  doc.moveDown(1);

  // ─── Flags ───
  const flags = Object.entries(claim.flags || {}).filter(([, v]) => v);
  if (flags.length > 0) {
    doc.fontSize(12).fillColor(accent).text('Flags', 50);
    doc.moveDown(0.3);
    const flagLabels = {
      dateMismatch: 'Date Mismatch', overLimit: 'Over Limit', duplicateReceipt: 'Duplicate Receipt',
      blurryImage: 'Blurry Image', contextualMismatch: 'Context Mismatch',
      anomalousAmount: 'Anomalous Amount', amountMismatch: 'Amount Mismatch',
    };
    flags.forEach(([key]) => {
      doc.fontSize(9).fillColor('#ef4444').text(`⚠ ${flagLabels[key] || key}`, 65);
    });
  }

  // ─── Override ───
  if (claim.auditorOverride?.isOverridden) {
    doc.moveDown(1);
    doc.fontSize(12).fillColor(accent).text('Auditor Override', 50);
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#1a2e27').text(`Status changed to: ${claim.auditorOverride.overriddenStatus}`, 65);
    doc.fontSize(9).fillColor('#4a6b5d').text(`Comment: "${claim.auditorOverride.comment}"`, 65);
    doc.fontSize(8).fillColor(gray).text(`At: ${claim.auditorOverride.overriddenAt ? new Date(claim.auditorOverride.overriddenAt).toLocaleString('en-IN') : '—'}`, 65);
  }

  // ─── Footer ───
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(7).fillColor(gray).text(
      `Generated by AuditLens on ${new Date().toLocaleString('en-IN')} — Page ${i + 1} of ${pages.count}`,
      50, doc.page.height - 40, { align: 'center', width: doc.page.width - 100 }
    );
  }

  doc.end();
  return doc;
}

module.exports = { generateClaimReport };
