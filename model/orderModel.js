import mongoose from 'mongoose';

const trackingEntrySchema = new mongoose.Schema({
  status:     { type: String, required: true },
  message:    { type: String, default: '' },
  timestamp:  { type: Date, default: Date.now },
  completed:  { type: Boolean, default: false },
}, { _id: false });

// ── Product snapshot (frozen at purchase time) ──────────────────
const orderItemSchema = new mongoose.Schema({
  productId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  variantId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Variant' },
  productName:    { type: String, required: true },
  productImage:   { type: String, default: '' },
  variantSpecs:   { type: String, default: '' },
  quantity:       { type: Number, required: true, min: 1 },
  mrp:            { type: Number, required: true },
  salePrice:      { type: Number, required: true },
  itemTotal:      { type: Number, required: true },
  discountPercent:{ type: Number, default: 0 },
  
  // ── Product-Level Order Management ───────────────────────────────
  orderStatus: {
    type: String,
    enum: [
      'Pending', 'Confirmed', 'Packed',
      'Shipped', 'Out for Delivery', 'Delivered',
      'Cancelled', 'Return Requested',
      'Return Approved', 'Pickup Scheduled',
      'Return Picked', 'Refund Processed',
      'Return Rejected', 'Returned'
    ],
    default: 'Pending',
  },
  cancelStatus: {
    type: String,
    default: 'None'
  },
  returnStatus: {
    type: String,
    default: 'None'
  },
  refundStatus: { 
    type: String, 
    default: 'Pending' 
  },
  trackingTimeline: [trackingEntrySchema],
  cancellationReason: { type: String, default: '' },
  returnReason:       { type: String, default: '' },
  returnEvidenceImages: [{ type: String }],
  returnRejectionReason: { type: String, default: '' },
  returnPickupStatus: { type: String, default: 'Pending' }, // 'Pending', 'Scheduled', 'Picked'
  returnInspectionStatus: { type: String, default: 'Pending' }, // 'Pending', 'Inspected'
  returnInspectionDecision: { type: String, default: '' }, // 'Restocked', 'Damaged'
}, { _id: true }); // Enable _id for subdocuments so we can easily find specific products in an order

// ── Address snapshot (frozen at purchase time) ──────────────────
const addressSnapshotSchema = new mongoose.Schema({
  fullName:     { type: String, required: true },
  phone:        { type: String, required: true },
  addressLine:  { type: String, required: true },
  city:         { type: String, required: true },
  state:        { type: String, required: true },
  pincode:      { type: String, required: true },
  addressType:  { type: String, default: 'Home' },
}, { _id: false });

// ── Main Order Schema ───────────────────────────────────────────
const orderSchema = new mongoose.Schema({

  orderId: {
    type: String,
    unique: true,
    required: true,
  },

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true,
  },

  products: [orderItemSchema],

  shippingAddress: addressSnapshotSchema,

  paymentMethod: {
    type: String,
    enum: ['COD', 'Razorpay', 'Stripe', 'UPI', 'Card', 'Wallet'],
    default: 'COD',
  },

  paymentStatus: {
    type: String,
    enum: ['Pending', 'Paid', 'Failed', 'Refunded', 'Awaiting'],
    default: 'Pending',
  },

  // Order-level status is computed or represents the overall state (e.g. if all cancelled, overall is cancelled)
  // For legacy/simplicity we can keep an overall status but the source of truth will be product level
  orderStatus: {
    type: String,
    default: 'Pending',
  },

  deliveryType: {
    type: String,
    enum: ['Normal', 'Fast'],
    default: 'Normal',
  },

  // ── Financials ────────────────────────────────────────────────
  subtotalMrp:    { type: Number, default: 0 },
  discount:       { type: Number, default: 0 },
  couponDiscount: { type: Number, default: 0 },
  deliveryCharge: { type: Number, default: 0 },
  codCharge:      { type: Number, default: 0 },
  cgst:           { type: Number, default: 0 },
  sgst:           { type: Number, default: 0 },
  totalAmount:    { type: Number, required: true },
  totalSaved:     { type: Number, default: 0 },

  // ── Dates ──────────────────────────────────────────────────────
  orderDate:         { type: Date, default: Date.now },
  estimatedDelivery: { type: Date },

  razorpayOrderId:    { type: String, default: '' },
  razorpayOrderId:    { type: String, default: '' },
  invoiceUrl:         { type: String, default: '' },

}, { timestamps: true });

// ── Static: generate unique TYM-XXXXXXX order ID ───────────────
orderSchema.statics.generateOrderId = async function () {
  let orderId, exists;
  const year = new Date().getFullYear();
  do {
    const rand = Math.floor(10000 + Math.random() * 90000);
    orderId = `TYM-${year}-${rand}`;
    exists = await this.findOne({ orderId });
  } while (exists);
  return orderId;
};

export default mongoose.model('Order', orderSchema);
