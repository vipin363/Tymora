import mongoose from 'mongoose';

const wishlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true,
    unique: true
  },
  products: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, { timestamps: true });

wishlistSchema.index({ userId: 1, 'products.productId': 1 });

export default mongoose.model('Wishlist', wishlistSchema);
