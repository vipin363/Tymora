import mongoose from 'mongoose';
import Order from './model/orderModel.js';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  try {
    const totalOrders = await Order.countDocuments({});
    console.log('totalOrders', totalOrders);
    
    const totalRevenue = await Order.aggregate([
      { $match: { orderStatus: { $nin: ['Cancelled'] } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    console.log('SUCCESS:', totalOrders, totalRevenue);
  } catch(e) {
    console.log('ERROR IS:', e);
  }
  process.exit(0);
});
