import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
  description: { type: String, default: '' },
  gender: { type: String, enum: ['men', 'women', 'unisex'], default: 'unisex' },
  price: { type: Number, required: true },
  stock: { type: Number, default: 0 },
  sku: { type: String, unique: true, sparse: true },
  discount: { type: Number, default: 0 },
  images: [{ type: String }],
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  featured: { type: Boolean, default: false },
  dealOfTheDay: { type: Boolean, default: false },
  offerProduct: { type: Boolean, default: false },
  deleted_at: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model('Product', productSchema);