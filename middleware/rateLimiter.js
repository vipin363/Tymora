import rateLimit from 'express-rate-limit';

// LOGIN LIMITER
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,

  handler: (req, res) => {
    if (req.originalUrl.startsWith('/admin')) {
      return res.status(429).render('admin/login', {
        layout: 'auth',
        error: 'Too many login attempts. Please try again after 15 minutes.',
        email: req.body?.email || '',
      });
    }

    return res.status(429).render('user/login', {
      layout: 'auth',
      message: 'Too many login attempts. Please try again after 15 minutes.',
    });
  },
});

// REGISTER LIMITER
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,

  handler: (req, res) => {
    return res.status(429).render('user/register', {
      layout: 'auth',
      message: 'Too many registration attempts. Please try again after 1 hour.',
    });
  },
});

// FORGOT PASSWORD LIMITER
export const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,

  handler: (req, res) => {
    if (req.originalUrl.startsWith('/admin')) {
      return res.status(429).render('admin/forgotPassword', {
        layout: 'auth',
        error:
          'Too many password reset attempts. Please try again after 15 minutes.',
      });
    }

    // NOTE: lowercase p because your controller uses user/forgotpassword
    return res.status(429).render('user/forgotpassword', {
      layout: 'auth',
      message:
        'Too many password reset attempts. Please try again after 15 minutes.',
    });
  },
});

// REGISTER OTP VERIFY LIMITER
export const registerOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,

  handler: (req, res) => {
    return res.status(429).render('user/otp', {
      layout: 'auth',
      email: req.session.userData?.email,
      remaining: 0,
      formAction: '/user/verifyOtp',
      message: 'Too many OTP attempts. Please try again after 15 minutes.',
    });
  },
});

// FORGOT PASSWORD OTP VERIFY LIMITER
export const forgotOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,

  handler: (req, res) => {
    if (req.originalUrl.startsWith('/admin')) {
      return res.status(429).render('admin/otp', {
        layout: 'auth',
        email: req.session.resetEmail,
        remaining: 0,
        formAction: '/admin/otp',
        error: 'Too many OTP attempts. Please try again after 15 minutes.',
      });
    }

    return res.status(429).render('user/otp', {
      layout: 'auth',
      email: req.session.resetEmail,
      remaining: 0,
      formAction: '/user/verifyForgotOtp',
      message: 'Too many OTP attempts. Please try again after 15 minutes.',
    });
  },
});

// REGISTER OTP RESEND LIMITER
export const registerResendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,

  handler: (req, res) => {
    return res.status(429).render('user/otp', {
      layout: 'auth',
      email: req.session.userData?.email,
      remaining: 0,
      formAction: '/user/verifyOtp',
      message:
        'Too many OTP resend requests. Please try again after 15 minutes.',
    });
  },
});

// FORGOT PASSWORD OTP RESEND LIMITER
export const forgotResendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,

  handler: (req, res) => {
    if (req.originalUrl.startsWith('/admin')) {
      return res.status(429).render('admin/otp', {
        layout: 'auth',
        email: req.session.resetEmail,
        remaining: 0,
        formAction: '/admin/otp',
        error:
          'Too many OTP resend requests. Please try again after 15 minutes.',
      });
    }

    return res.status(429).render('user/otp', {
      layout: 'auth',
      email: req.session.resetEmail,
      remaining: 0,
      formAction: '/user/verifyForgotOtp',
      message:
        'Too many OTP resend requests. Please try again after 15 minutes.',
    });
  },
});

// CHANGE EMAIL OTP RESEND LIMITER
export const changeEmailResendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,

  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message:
        'Too many OTP resend requests. Please try again after 15 minutes.',
    });
  },
});
