import nodemailer from 'nodemailer';

// Helper to filter out external vendor/customer emails and restrict to internal domains
function filterInternalRecipientsOnly(emailInput, defaultInternal = 'admin@samyakinternational.in') {
  if (!emailInput) return defaultInternal;
  const internalDomainRegex = /@(samyakinternational\.in|plant\.com|samyak\.com|samyakflexi\.com)$/i;

  const emails = String(emailInput)
    .split(/[,;]/)
    .map(e => e.trim())
    .filter(Boolean);

  const internalOnly = emails.filter(e => {
    const clean = e.toLowerCase();
    if (clean.includes('vendor') || clean.includes('customer') || clean.includes('client') || clean.includes('supplier')) {
      return false;
    }
    return internalDomainRegex.test(clean);
  });

  return internalOnly.length > 0 ? internalOnly.join(', ') : defaultInternal;
}

// Vercel Serverless Function: General ERP Transactional Email Dispatch
// Reachable at POST /api/send-email
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed. Use POST.' });
  }

  const { to, cc, subject, html, text } = req.body || {};

  const sanitizedTo = filterInternalRecipientsOnly(to, 'admin@samyakinternational.in');
  const sanitizedCc = cc ? filterInternalRecipientsOnly(cc, '') : '';

  if (!sanitizedTo || !subject) {
    return res.status(400).json({ success: false, message: 'Recipient internal email and subject are required.' });
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: process.env.SMTP_SECURE === 'true' || parseInt(process.env.SMTP_PORT || '465', 10) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const mailOptions = {
    from: `"Samyak International ERP" <${process.env.SMTP_USER}>`,
    to: sanitizedTo,
    ...(sanitizedCc ? { cc: sanitizedCc } : {}),
    subject,
    text,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('Notification email error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
