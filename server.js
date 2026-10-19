import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import adminUsers from './api/admin-users.js';
import sendEmail from './api/send-email.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5050;

// Hostinger SMTP Transporter Setup
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port: parseInt(process.env.SMTP_PORT || '465', 10),
  secure: process.env.SMTP_SECURE === 'true' || parseInt(process.env.SMTP_PORT, 10) === 465, // true for 465 SSL/TLS
  auth: {
    user: process.env.SMTP_USER || 'admin@samyakinternational.in',
    pass: process.env.SMTP_PASS || '',
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Verify SMTP connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Hostinger SMTP Connection Error:', error.message);
  } else {
    console.log('✅ Hostinger SMTP Transporter is ready to send emails via admin@samyakinternational.in');
  }
});

/**
 * Retired one-time-code reset. Supabase Auth sends the real reset link.
 */
app.post('/api/recover-password', (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Password reset is handled by Supabase Auth. Use Forgot password on the login screen.'
  });
});

app.post('/api/admin-users', (req, res) => adminUsers(req, res));

app.post('/api/send-email', (req, res) => sendEmail(req, res));

// Serve static assets in production if built
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`🚀 SamyakFlexi ERP Backend API Server running on port ${PORT}`);
});
