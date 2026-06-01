import mongoose from 'mongoose';

const referralSchema = new mongoose.Schema({
  referrer: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'user', 
    required: true 
  },
  referredUser: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'user', 
    required: true 
  },
  referredEmail: {
    type: String,
    required: true
  },
  referralCodeUsed: { 
    type: String, 
    required: true 
  },
  referralSource: {
    type: String,
    enum: ['Code', 'Link'],
    required: true
  },
  rewardStatus: { 
    type: String, 
    enum: ['PENDING', 'COMPLETED', 'VOID'], 
    default: 'PENDING' 
  },
  referrerRewardAmount: { 
    type: Number, 
    default: 0 
  },
  referredRewardAmount: { 
    type: Number, 
    default: 0 
  },
  rewardReleaseDate: { 
    type: Date,
    default: null
  },
  firstDeliveredOrderId: {
    type: String,
    default: null
  }
}, { timestamps: true });

export default mongoose.model('Referral', referralSchema);
