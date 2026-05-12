
import mongoose from "mongoose";

const otpSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true 
},
  otp_code: { 
    type: String, 
    required: true 
},
  purpose: { 
    type: String, 
    enum: ["register", "forgot_password", "change_email"], 
    required: true 
},
  is_used: { 
    type: Boolean, 
    default: false 
},
  expires_at: { 
    type: Date, 
    required: true 
},
  created_at: { 
    type: Date, 
    default: Date.now 
}
});

otpSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("Otp", otpSchema);