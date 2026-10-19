// Retired. Password reset is Supabase Auth (resetPasswordForEmail).
// This route stays so an old cached bundle cannot send a one-time code
// that was never checked.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed. Use POST.' });
  }
  return res.status(410).json({
    success: false,
    message: 'Password reset is handled by Supabase Auth. Use Forgot password on the login screen.'
  });
}
