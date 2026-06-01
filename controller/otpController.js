import bcrypt from "bcrypt";
import userSchema from "../model/userModel.js";
import { generateAndSaveOtp, verifyOtpFromDb } from "../services/otpService.js";
import Otp from "../model/otpModel.js";
import Referral from "../model/referralModel.js";
import Settings from "../model/settingsModel.js";
import { clearReferralCookie } from "../middleware/captureReferral.js";

// Helper: generate a unique referral code like TYM + 6 chars
async function generateUniqueReferralCode(name) {
  const prefix = (name || "USER").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 4);
  let code, exists;
  do {
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    code = `${prefix}${rand}`;
    exists = await userSchema.findOne({ referralCode: code });
  } while (exists);
  return code;
}

export const loadOtpPage = async (req, res) => {
  if (!req.session.userData) {
    return res.redirect("/user/register?message=Session expired. Please try again");
  }
  const email = req.session.userData.email;
  const record = await Otp.findOne({ email, purpose: "register", is_used: false }).sort({ created_at: -1 });
  const remaining = record ? Math.max(0, Math.floor((record.expires_at - new Date()) / 1000)) : 0;
  res.render("user/otp", {
    layout: "auth",
    email,
    remaining,
    formAction: "/user/verifyOtp",
    changeEmailLink: req.session.changeEmailLink,
  });
};

export const verifyOtp = async (req, res) => {
  try {
    if (!req.session.userData) {
      return res.redirect("/user/register?message=Session expired. Please register again");
    }

    const { otp } = req.body;
    const email = req.session.userData.email;

    if (!otp || otp.trim() === "") {
      const record = await Otp.findOne({ email, purpose: "register", is_used: false }).sort({ created_at: -1 });
      const remaining = record ? Math.max(0, Math.floor((record.expires_at - new Date()) / 1000)) : 0;
      return res.render("user/otp", { layout: "auth", email, remaining, formAction: "/user/verifyOtp", message: "Please enter OTP" });
    }

    const result = await verifyOtpFromDb({ email, otp_code: otp, purpose: "register" });

    if (result.reason === "expired") {
      return res.render("user/otp", { layout: "auth", email, remaining: 0, formAction: "/user/verifyOtp", message: "OTP expired. Please resend." });
    }

    if (!result.success) {
      return res.render("user/otp", { layout: "auth", email, remaining: result.remaining, formAction: "/user/verifyOtp", message: "Invalid OTP" });
    }

    const data = req.session.userData;
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Generate unique referral code
    const referralCode = await generateUniqueReferralCode(data.name);

    const newUser = await userSchema.create({
      name: data.name,
      email: data.email,
      password: hashedPassword,
      referralCode,
      referredBy: data.referrerId || null,
    });

    // Create Referral record if referred
    if (data.referrerId && data.referralCodeUsed) {
      const settings = await Settings.findOne();
      await Referral.create({
        referrer: data.referrerId,
        referredUser: newUser._id,
        referredEmail: data.email,
        referralCodeUsed: data.referralCodeUsed,
        referralSource: data.referralSource || 'Code',
        rewardStatus: "PENDING",
        referrerRewardAmount: settings?.referrerReward || 100,
        referredRewardAmount: settings?.referredReward || 50,
      });
    }

    req.session.user = { id: newUser._id, name: newUser.name };
    req.session.userData = null;
    clearReferralCookie(res); // Consume the referral cookie
    console.log(`[OTP] ✅ Account created: ${data.email} | referralCode=${newUser.referralCode}`);
    return res.redirect("/user/?message=Registration successful");
  } catch (err) {
    console.error("verifyOtp error:", err);
    return res.render("user/otp", {
      layout: "auth",
      email: req.session.userData?.email,
      remaining: 0,
      formAction: "/user/verifyOtp",
      message: "Something went wrong",
    });
  }
};

export const resendOtp = async (req, res) => {
  try {
    if (req.session.resetEmail) {
      await generateAndSaveOtp({
        email: req.session.resetEmail,
        purpose: "forgot_password",
      });
      return res.redirect("/user/forgotOtp");
    }

    if (req.session.userData) {
      await generateAndSaveOtp({
        email: req.session.userData.email,
        purpose: "register",
      });
      return res.redirect("/user/otp");
    }

    return res.redirect("/user/forgotPassword");
  } catch (err) {
    console.log(err);
    return res.redirect("/user/forgotPassword");
  }
};

export const loadForgotOtpPage = async (req, res) => {
  if (!req.session.resetEmail) {
    return res.redirect("/user/forgotPassword");
  }
  const email = req.session.resetEmail;
  const record = await Otp.findOne({
    email,
    purpose: "forgot_password",
    is_used: false,
  }).sort({ created_at: -1 });
  const remaining = record
    ? Math.max(0, Math.floor((record.expires_at - new Date()) / 1000))
    : 0;
  res.render("user/otp", {
    layout: "auth",
    email,
    remaining,
    formAction: "/user/verifyForgotOtp",
    changeEmailLink: req.session.changeEmailLink,
  });
};

export const verifyForgotOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    const email = req.session.resetEmail;

    if (!email) return res.redirect("/user/forgotPassword");

    if (!otp || otp.trim() === "") {
      const record = await Otp.findOne({
        email,
        purpose: "forgot_password",
        is_used: false,
      }).sort({ created_at: -1 });
      const remaining = record
        ? Math.max(0, Math.floor((record.expires_at - new Date()) / 1000))
        : 0;
      return res.render("user/otp", {
        layout: "auth",
        email,
        remaining,
        formAction: "/user/verifyForgotOtp",
        message: "Please enter OTP",
      });
    }

    const result = await verifyOtpFromDb({
      email,
      otp_code: otp,
      purpose: "forgot_password",
    });

    if (result.reason === "expired") {
      return res.render("user/otp", {
        layout: "auth",
        email,
        remaining: 0,
        formAction: "/user/verifyForgotOtp",
        message: "OTP expired. Please resend.",
      });
    }

    if (!result.success) {
      return res.render("user/otp", {
        layout: "auth",
        email,
        remaining: result.remaining,
        formAction: "/user/verifyForgotOtp",
        message: "Invalid OTP",
      });
    }

    req.session.resetVerified = true;
    return res.redirect("/user/resetPassword");
  } catch (err) {
    console.log(err);
    return res.render("user/otp", {
      layout: "auth",
      email: req.session.resetEmail,
      remaining: 0,
      formAction: "/user/verifyForgotOtp",
      message: "Something went wrong",
    });
  }
};

// admin otp

export const loadAdminOtpPage = async (req, res) => {
  if (!req.session.resetEmail) {
    return res.redirect("/admin/forgotPassword");
  }
  const email = req.session.resetEmail;
  const record = await Otp.findOne({
    email,
    purpose: "forgot_password",
    is_used: false,
  }).sort({ created_at: -1 });
  const remaining = record
    ? Math.max(0, Math.floor((record.expires_at - new Date()) / 1000))
    : 0;
  res.render("admin/otp", { email, remaining, formAction: "/admin/otp" });
};

export const verifyAdminForgotOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    const email = req.session.resetEmail;

    if (!email) return res.redirect("/admin/forgotPassword");

    if (!otp || otp.trim() === "") {
      const record = await Otp.findOne({
        email,
        purpose: "forgot_password",
        is_used: false,
      }).sort({ created_at: -1 });
      const remaining = record
        ? Math.max(0, Math.floor((record.expires_at - new Date()) / 1000))
        : 0;
      return res.render("admin/otp", {
        email,
        remaining,
        formAction: "/admin/otp",
        message: "Please enter OTP",
      });
    }

    const result = await verifyOtpFromDb({
      email,
      otp_code: otp,
      purpose: "forgot_password",
    });

    if (result.reason === "expired") {
      return res.render("admin/otp", {
        email,
        remaining: 0,
        formAction: "/admin/otp",
        message: "OTP expired",
      });
    }

    if (!result.success) {
      return res.render("admin/otp", {
        email,
        remaining: result.remaining,
        formAction: "/admin/otp",
        error: "Invalid OTP",
      });
    }

    req.session.resetVerified = true;
    return res.redirect("/admin/resetPassword");
  } catch (err) {
    console.log(err);
    return res.render("admin/otp", {
      email: req.session.resetEmail,
      remaining: 0,
      formAction: "/admin/otp",
      message: "Something went wrong",
    });
  }
};

export const resendAdminOtp = async (req, res) => {
  try {
    const email = req.session.resetEmail;
    if (!email) return res.redirect("/admin/forgotPassword");

    await generateAndSaveOtp({
      email,
      purpose: "forgot_password",
    });

    return res.redirect("/admin/otp");
  } catch (err) {
    console.log(err);
    return res.redirect("/admin/forgotPassword");
  }
};
