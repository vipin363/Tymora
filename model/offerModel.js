import mongoose from 'mongoose';

const offerSchema = new mongoose.Schema({

  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: "" },
  offerBadgeText: { type: String, trim: true, default: "" },
  isActive: { type: Boolean, default: true },

 
  discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
  discountValue: { type: Number, required: true, min: 0 },
  maxDiscountLimit: { type: Number, default: null },
  minPurchaseAmount: { type: Number, default: 0 },


  offerType: { type: String, enum: ['product', 'category', 'brand', 'global'], required: true },
  
  
  applicableProducts:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  applicableCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  applicableBrands:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Brand' }],


  excludedProducts:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  excludedCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  excludedBrands:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Brand' }],

 
  allowedUsers: { type: String, enum: ['all', 'first_time', 'premium', 'specific'], default: 'all' },
  specificUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Only populated if allowedUsers='specific'
  usageLimit: { type: Number, default: null }, // Global cap across all users
  perUserLimit: { type: Number, default: 1 },  // Cap per individual user
  usedCount: { type: Number, default: 0 },     // Track how many times it was actually used

 
  paymentMethods: [{ type: String }], 


  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },

 
  includesFreeShipping: { type: Boolean, default: false },
  isStackable: { type: Boolean, default: false }, // Can be used alongside other offers
  stackableWithCoupons: { type: Boolean, default: false }, // Can be used with coupons
  autoApply: { type: Boolean, default: false },
  priority: { type: Number, default: 0 }, // Higher wins in a conflict

}, { timestamps: true });

// Virtual property to calculate real-time status dynamically
offerSchema.virtual('status').get(function() {
  const now = new Date();
  if (!this.isActive) return 'Disabled';
  if (this.startDate > now) return 'Scheduled';
  if (this.endDate < now) return 'Expired';
  return 'Active';
});

// Ensure virtuals are included
offerSchema.set('toJSON', { virtuals: true });
offerSchema.set('toObject', { virtuals: true });

export default mongoose.model('Offer', offerSchema);
