import nodemailer from 'nodemailer';

// Vercel Serverless Function: General ERP Transactional Email Dispatch
// Reachable at POST /api/send-email
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed. Use POST.' });
  }

  const { to, subject, html, text } = req.body || {};

  if (!to || !subject) {
    return res.status(400).json({ success: false, message: 'Recipient email and subject are required.' });
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
    to,
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
