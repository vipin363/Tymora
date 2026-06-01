import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Product from './model/productModel.js';
import Review from './model/reviewModel.js';
import { connectDB } from './db/connectDB.js';

const syncRatings = async () => {
  await connectDB();
  const products = await Product.find({});
  for (const product of products) {
    const reviews = await Review.find({ productId: product._id, isVisible: true });
    const numReviews = reviews.length;
    let avgRating = 0;
    if (numReviews > 0) {
      const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
      avgRating = (sum / numReviews).toFixed(1);
    }
    product.rating = avgRating;
    product.reviews = numReviews;
    await product.save();
  }
  console.log('All product ratings synced!');
  process.exit(0);
};

syncRatings();
