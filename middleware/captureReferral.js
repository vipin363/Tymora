/**
 * captureReferral.js
 * Global middleware: captures ?ref=CODE from ANY page the user visits
 * and stores it in a secure HttpOnly cookie that survives OAuth redirects.
 *
 * Cookie settings:
 *   httpOnly  : true  → not readable via JS (prevents XSS theft)
 *   sameSite  : 'lax' → MUST be lax (not strict) so the cookie is sent on
 *                        top-level GET redirects (i.e. Google → our callback)
 *   secure    : true in production only
 *   maxAge    : 7 days → gives the user plenty of time to complete signup
 */
export function captureReferral(req, res, next) {
  const raw = req.query.ref;
  if (raw && typeof raw === 'string') {
    const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length >= 4 && code.length <= 20) {
      res.cookie('_tyref', code, {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
      console.log(`[Referral] ✅ Code captured: ${code} | URL: ${req.method} ${req.originalUrl}`);
    }
  }
  next();
}

/**
 * Helper used by controllers and passport to read the referral code.
 * Reads from cookie (primary) or session fallback (legacy Google flow).
 */
export function getReferralCode(req) {
  return req.cookies?._tyref || req.session?.googleReferralCode || null;
}

/**
 * Clear the referral cookie after it has been consumed (account created).
 */
export function clearReferralCookie(res) {
  res.clearCookie('_tyref', { httpOnly: true, sameSite: 'lax' });
}
