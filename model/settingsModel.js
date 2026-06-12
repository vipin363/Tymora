
import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema({
  standardShippingFee: { type: Number, default: 0 },
  fastShippingFee: { type: Number, default: 50 },
  returnPeriodDays: { type: Number, default: 7 },
  referralProgramEnabled: { type: Boolean, default: true },
  referrerReward: { type: Number, default: 100 },
  referredReward: { type: Number, default: 50 },
}, { timestamps: true });

export default mongoose.model("Settings", settingsSchema);

