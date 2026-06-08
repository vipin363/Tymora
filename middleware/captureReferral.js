
export function captureReferral(req, res, next) {
  const raw = req.query.ref;
  console.log(`[CaptureReferral] Executing for URL: ${req.originalUrl} | ?ref=${raw || 'none'}`);
  if (raw && typeof raw === 'string') {
    const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length >= 4 && code.length <= 20) {
      res.cookie('_tyref', code, {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
      console.log(`[CaptureReferral] ✅ Cookie _tyref successfully set to: ${code}`);
    }
  }
  next();
}


export function getReferralCode(req) {
  return req.cookies?._tyref || req.session?.googleReferralCode || null;
}


export function clearReferralCookie(res) {
  res.clearCookie('_tyref', { httpOnly: true, sameSite: 'lax' });
}
