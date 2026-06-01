import mongoose from "mongoose";

const couponSchema = new mongoose.Schema({

  code:        { type: String, required: true, unique: true, uppercase: true, trim: true },
  title:       { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },

  
  discountType:     { type: String, enum: ['percentage', 'fixed'], required: true },
  discountValue:    { type: Number, required: true, min: 0 },
  maxDiscountLimit: { type: Number, default: null },   // cap for percentage coupons
  minPurchase:      { type: Number, default: 0 },       // minimum cart value

 
  offerType: {
    type: String,
    enum: ['global', 'product', 'category', 'brand'],
    default: 'global',
  },
  applicableProducts:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  applicableCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  applicableBrands:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Brand' }],

 
  excludedProducts:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  excludedCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  excludedBrands:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Brand' }],

  
  isFirstTimeUserOnly: { type: Boolean, default: false },
  allowedUsers:        [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }], // empty = all users
  usageLimit:          { type: Number, default: 0 },  // 0 = unlimited
  perUserLimit:        { type: Number, default: 1 },
  usedCount:           { type: Number, default: 0 },
  usedBy:              [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],

 
  paymentMethods: {
    type: [String],
    enum: ['COD', 'Wallet', 'Online', 'UPI', 'Card', 'All'],
    default: ['All'],
  },

  
  isFreeShipping: { type: Boolean, default: false },
  isStackable:    { type: Boolean, default: false },
  autoApply:      { type: Boolean, default: false },
  priority:       { type: Number, default: 0 },


  startDate: { type: Date, required: true },
  endDate:   { type: Date, required: true },

 
  isActive:               { type: Boolean, default: true },
  totalSavingsGenerated:  { type: Number, default: 0 },

}, { timestamps: true });


couponSchema.virtual('status').get(function () {
  const now = new Date();
  if (!this.isActive)          return 'Disabled';
  if (this.startDate > now)    return 'Scheduled';
  if (this.endDate   < now)    return 'Expired';
  return 'Active';
});

couponSchema.set('toJSON',   { virtuals: true });
couponSchema.set('toObject', { virtuals: true });

export default mongoose.model('Coupon', couponSchema);
