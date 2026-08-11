import nodemailer from 'nodemailer';

// Vercel Serverless Function: Password Recovery Email Dispatch
// Reachable at POST /api/recover-password
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed. Use POST.' });
  }

  const { email } = req.body || {};

  if (!email) {
    return res.status(400).json({ success: false, message: 'Work Email address is required.' });
  }

  const recoveryCode = Math.floor(100000 + Math.random() * 900000).toString();

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
    to: email,
    subject: '🔐 Password Recovery Request — SamyakFlexi ERP',
    html: `
      <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 30px; border-radius: 10px; max-width: 600px; margin: 0 auto; color: #0f172a;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #0f172a; margin-bottom: 4px;">Samyak International Ltd</h2>
          <p style="color: #64748b; font-size: 13px; margin: 0;">Flexible Packaging Manufacturing Division • Indore Plant</p>
        </div>
        <div style="background: #ffffff; padding: 24px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <h3 style="color: #0f172a; font-size: 18px; margin-top: 0;">Password Recovery Code</h3>
          <p style="color: #475569; font-size: 14px; line-height: 1.5;">
            We received a password reset request for your ERP account associated with <strong>${email}</strong>.
          </p>
          <div style="background: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0;">
            <span style="font-size: 12px; color: #64748b; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Your 6-Digit Verification Code</span>
            <span style="font-size: 32px; font-weight: 800; color: #0f172a; letter-spacing: 6px;">${recoveryCode}</span>
          </div>
          <p style="color: #475569; font-size: 13px;">
            Please enter this verification code on the ERP login screen to set a new password. This code will expire in 15 minutes.
          </p>
          <div style="border-top: 1px solid #f1f5f9; margin-top: 20px; padding-top: 16px; font-size: 12px; color: #94a3b8;">
            If you did not request a password reset, please ignore this email or notify IT Security.
          </div>
        </div>
        <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #94a3b8;">
          GSTIN: 23AABCM3526F1ZY • Kheda Industrial Area, Pithampur, MP
        </div>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return res.status(200).json({
      success: true,
      message: `Password recovery code sent to ${email}`,
      recoveryCode,
    });
  } catch (error) {
    console.error('Email dispatch failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send recovery email via Hostinger SMTP. Please check email address and SMTP server settings.',
      error: error.message,
    });
  }
}
