const nodemailer = require('nodemailer');

/**
 * Email service for sending claim status notifications.
 * Configurable via env vars. Fails silently (fire-and-forget).
 */

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user) {
    return null; // Email not configured — skip silently
  }

  transporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
  });

  return transporter;
}

const BASE_CURRENCY_SYMBOL = process.env.BASE_CURRENCY_SYMBOL || '₹';

/**
 * Generate styled HTML email body
 */
function buildEmailHTML({ title, greeting, body, statusColor, footer }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f4f7f6;">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0f4f3c,#1a7a5c);padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:20px;">Audit<span style="color:#5fe0b8;">Lens</span></h1>
      <p style="margin:4px 0 0;color:#a0d5c4;font-size:13px;">Expense Intelligence</p>
    </div>
    <div style="padding:28px 32px;">
      <h2 style="margin:0 0 8px;color:#1a2e27;font-size:18px;">${title}</h2>
      <p style="color:#4a6b5d;font-size:14px;line-height:1.6;margin:0 0 20px;">${greeting}</p>
      <div style="background:#f8faf9;border-radius:8px;padding:20px;border-left:4px solid ${statusColor || '#5fa08e'};">
        ${body}
      </div>
      ${footer ? `<p style="color:#8a9f97;font-size:12px;margin:20px 0 0;text-align:center;">${footer}</p>` : ''}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Send claim status notification email
 */
async function sendClaimStatusEmail(employee, claim, status) {
  const t = getTransporter();
  if (!t) return; // Email not configured

  const statusLabels = {
    approved: { label: 'Approved ✅', color: '#22c55e' },
    flagged: { label: 'Flagged ⚠️', color: '#eab308' },
    rejected: { label: 'Rejected ❌', color: '#ef4444' },
    processing: { label: 'Processing ⏳', color: '#3b82f6' },
  };

  const { label, color } = statusLabels[status] || { label: status, color: '#6b7280' };
  const amount = claim.extractedData?.amount;
  const currency = claim.extractedData?.currency || 'INR';

  const body = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;color:#2d4a3e;">
      <tr><td style="padding:6px 0;font-weight:600;">Status</td><td style="padding:6px 0;color:${color};font-weight:700;">${label}</td></tr>
      <tr><td style="padding:6px 0;font-weight:600;">Merchant</td><td style="padding:6px 0;">${claim.extractedData?.merchantName || 'Unknown'}</td></tr>
      <tr><td style="padding:6px 0;font-weight:600;">Amount</td><td style="padding:6px 0;font-family:monospace;">${currency} ${amount ? amount.toLocaleString() : '—'}</td></tr>
      <tr><td style="padding:6px 0;font-weight:600;">Category</td><td style="padding:6px 0;">${claim.extractedData?.category || '—'}</td></tr>
      ${claim.aiExplanation ? `<tr><td style="padding:6px 0;font-weight:600;">Reason</td><td style="padding:6px 0;font-style:italic;">${claim.aiExplanation}</td></tr>` : ''}
    </table>`;

  const html = buildEmailHTML({
    title: `Expense Claim ${label}`,
    greeting: `Hi ${employee.name},`,
    body,
    statusColor: color,
    footer: 'This is an automated notification from AuditLens. Do not reply to this email.',
  });

  try {
    await t.sendMail({
      from: `"AuditLens" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: employee.email,
      subject: `AuditLens — Your expense claim has been ${status}`,
      html,
    });
    console.log(`[emailService] Sent ${status} email to ${employee.email}`);
  } catch (err) {
    console.warn(`[emailService] Failed to send email:`, err.message);
  }
}

/**
 * Send override notification email
 */
async function sendOverrideEmail(employee, claim, newStatus, comment) {
  const t = getTransporter();
  if (!t) return;

  const body = `
    <p style="font-size:13px;color:#2d4a3e;margin:0 0 12px;">An auditor has reviewed your claim and changed the status:</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;color:#2d4a3e;">
      <tr><td style="padding:6px 0;font-weight:600;">New Status</td><td style="padding:6px 0;font-weight:700;text-transform:capitalize;">${newStatus}</td></tr>
      <tr><td style="padding:6px 0;font-weight:600;">Auditor Comment</td><td style="padding:6px 0;font-style:italic;">"${comment}"</td></tr>
      <tr><td style="padding:6px 0;font-weight:600;">Merchant</td><td style="padding:6px 0;">${claim.extractedData?.merchantName || 'Unknown'}</td></tr>
    </table>`;

  const html = buildEmailHTML({
    title: 'Expense Claim Reviewed',
    greeting: `Hi ${employee.name},`,
    body,
    statusColor: '#3b82f6',
    footer: 'This is an automated notification from AuditLens.',
  });

  try {
    await t.sendMail({
      from: `"AuditLens" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: employee.email,
      subject: `AuditLens — Your claim has been reviewed: ${newStatus.toUpperCase()}`,
      html,
    });
  } catch (err) {
    console.warn(`[emailService] Override email failed:`, err.message);
  }
}

module.exports = { sendClaimStatusEmail, sendOverrideEmail };
