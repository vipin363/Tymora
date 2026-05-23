
import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema({
  standardShippingFee: { type: Number, default: 0 },
  fastShippingFee: { type: Number, default: 50 },
  returnPeriodDays: { type: Number, default: 7 },
}, { timestamps: true });

export default mongoose.model("Settings", settingsSchema);

