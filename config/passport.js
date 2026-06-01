import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import userSchema from '../model/userModel.js';
import { getReferralCode } from '../middleware/captureReferral.js';

passport.use(new GoogleStrategy({
   clientID: process.env.GOOGLE_CLIENT_ID,
   clientSecret: process.env.GOOGLE_CLIENT_SECRET,
   callbackURL: "http://localhost:3000/user/auth/google/callback",
   passReqToCallback: true
},
async (req, accessToken, refreshToken, profile, done) => {
   try {
      const email = profile.emails[0].value;
      const isRegister = req.session.googleAuthType === 'register';

      console.log(`[Google OAuth] Callback received | mode=${isRegister ? 'register' : 'login'} | email=${email}`);

      let user = await userSchema.findOne({ email });

      // ─── LOGIN FLOW ────────────────────────────────────────────────
      if (!isRegister) {
         if (!user) {
            console.log(`[Google OAuth] Login failed – user not found: ${email}`);
            return done(null, false, { message: "User not found" });
         }
         if (user.isBlocked) {
            console.log(`[Google OAuth] Login failed – account blocked: ${email}`);
            return done(null, false, { message: "Account blocked" });
         }
         console.log(`[Google OAuth] Login success: ${email}`);
         return done(null, user);
      }

      // ─── REGISTER FLOW ─────────────────────────────────────────────
      if (user) {
         console.log(`[Google OAuth] Register failed – user already exists: ${email}`);
         return done(null, false, { message: "User already exists" });
      }

      // --- Recover referral code from cookie (primary) or session (fallback) ---
      const rawRefCode = getReferralCode(req);
      console.log(`[Google OAuth] Referral code recovered: ${rawRefCode || 'none'}`);

      let referrerId = null;
      let referralCodeUsed = null;

      if (rawRefCode) {
         const referrer = await userSchema.findOne({ referralCode: rawRefCode });

         if (!referrer) {
            console.log(`[Google OAuth] Referral code invalid – no matching user: ${rawRefCode}`);
         } else {
             // Self-referral check
             if (referrer.email === email) {
                console.log(`[Google OAuth] Self-referral attempt detected - skipping.`);
             } else {
                const Referral = (await import('../model/referralModel.js')).default;
                const alreadyReferred = await Referral.findOne({ referredEmail: email });
                if (alreadyReferred) {
                   console.log(`[Google OAuth] Referral already used by this email – skipping.`);
                } else {
                   referrerId = referrer._id;
                   referralCodeUsed = rawRefCode;
                   console.log(`[Google OAuth] Referral valid – referrer: ${referrer.email}`);
                }
             }
         }
      }

      // --- Generate unique referral code for the new user ---
      const prefix = (profile.displayName || 'USER').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 4);
      let newCode, exists;
      do {
         const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
         newCode = `${prefix}${rand}`;
         exists = await userSchema.findOne({ referralCode: newCode });
      } while (exists);

      user = await userSchema.create({
         name: profile.displayName,
         email,
         googleId: profile.id,
         referralCode: newCode,
         referredBy: referrerId,
      });

      console.log(`[Google OAuth] New user created: ${email} | referralCode=${newCode}`);

      // --- Create Referral record if valid referrer ---
      if (referrerId && referralCodeUsed) {
         const Settings = (await import('../model/settingsModel.js')).default;
         const Referral = (await import('../model/referralModel.js')).default;
         const settings = await Settings.findOne();

         if (settings?.referralProgramEnabled !== false) {
            await Referral.create({
               referrer: referrerId,
               referredUser: user._id,
               referredEmail: email,
               referralCodeUsed,
               referralSource: 'Link',
               rewardStatus: 'PENDING',
               referrerRewardAmount: settings?.referrerReward || 100,
               referredRewardAmount: settings?.referredReward || 50,
            });
            console.log(`[Google OAuth] Referral record created – Pending rewards queued.`);
         } else {
            console.log(`[Google OAuth] Referral program disabled – no record created.`);
         }
      }

      // --- Clear session fallback after consumption (cookie cleared in route callback) ---
      req.session.googleReferralCode = null;

      console.log(`[Google OAuth] ✅ Registration complete for: ${email}`);
      return done(null, user);

   } catch (err) {
      console.error('[Google OAuth] ❌ Strategy error:', err);
      return done(err, null);
   }
}));

passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
   try {
      const user = await userSchema.findById(id);
      done(null, user);
   } catch (err) {
      done(err, null);
   }
});