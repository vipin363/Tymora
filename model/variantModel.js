import mongoose from 'mongoose';

const variantSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  sku: { type: String, unique: true, sparse: true },
  strapColor: { type: String },
  dialColor: { type: String },
  caseColor: { type: String },
  size: { type: String },
  strapMaterial: { type: String },
  caseMaterial: { type: String },
  price: { type: Number, required: true },
  stock: { type: Number, default: 0 },
  images: [String],
  deleted_at: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model('Variant', variantSchema);