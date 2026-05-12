import Otp from "../model/otpModel.js";
import { sendOtpMail } from "./mailService.js";

export const generateAndSaveOtp = async ({ email, purpose }) => {

  await Otp.updateMany(
    { email, purpose, is_used: false },
    { is_used: true }
  );

  const otp_code = Math.floor(100000 + Math.random() * 900000).toString();

  await Otp.create({
    email,
    otp_code,
    purpose,
    expires_at: new Date(Date.now() + 60 * 1000)
  });

  await sendOtpMail(email, otp_code);
};

export const verifyOtpFromDb = async ({ email, otp_code, purpose }) => {

  const record = await Otp.findOne({
    email,
    purpose,
    is_used: false
  }).sort({ created_at: -1 });

  if (!record) {
    return { success: false, reason: "not_found", remaining: 0 };
  }

  const remaining = Math.max(0, Math.floor((record.expires_at - new Date()) / 1000));

  if (new Date() > record.expires_at) {
    await Otp.findByIdAndUpdate(record._id, { is_used: true });
    return { success: false, reason: "expired", remaining: 0 };
  }

  if (record.otp_code !== String(otp_code).trim()) {
    return { success: false, reason: "invalid", remaining };
  }

  await Otp.findByIdAndUpdate(record._id, { is_used: true });
  return { success: true, remaining };
};