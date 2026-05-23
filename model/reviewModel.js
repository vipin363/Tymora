
import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  orderId: { type: String, required: true }, // To enforce 1 review per product per order
  rating: { type: Number, required: true, min: 1, max: 5 },
  reviewText: { type: String, required: true, minlength: 5, maxlength: 500 },
}, { timestamps: true });

// Prevent multiple reviews for the same product in the same order
reviewSchema.index({ productId: 1, userId: 1, orderId: 1 }, { unique: true });

export default mongoose.model("Review", reviewSchema);

