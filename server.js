import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import adminUsers from './api/admin-users.js';
import sendEmail from './api/send-email.js';
import { readSmtpConfig } from './api/smtpConfig.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5050;

// Verify SMTP on startup when it is fully configured. A missing setting is logged
// and does not stop the API. Mail routes refuse to send until the same settings exist.
try {
  const smtp = readSmtpConfig(process.env);
  const transporter = nodemailer.createTransport(smtp);
  transporter.verify((error) => {
    if (error) {
      console.error('SMTP connection check failed:', error.message);
    } else {
      console.log('SMTP transporter is ready.');
    }
  });
} catch (error) {
  console.error(error.message || 'SMTP is not configured. Mail routes will return an error until it is set.');
}

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
  const sendSpa = (req, res) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) {
      return res.status(404).json({ success: false, message: 'API route not found' });
    }
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  };
  app.get('/', sendSpa);
  app.get('/*splat', sendSpa);
}

app.listen(PORT, () => {
  console.log(`🚀 SamyakFlexi ERP Backend API Server running on port ${PORT}`);
});
