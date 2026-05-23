import mongoose from 'mongoose';
import User from './model/userModel.js';
import addressModel from './model/addressModel.js';
import Cart from './model/cartModel.js';
import Product from './model/productModel.js';
import Variant from './model/variantModel.js';
import Order from './model/orderModel.js';

async function test() {
  await mongoose.connect('mongodb://127.0.0.1:27017/AntiTymora');
  const user = await User.findOne({});
  const cart = await Cart.findOne({ userId: user._id });
  const address = await addressModel.findOne({ userId: user._id });
  
  try {
    const orderId = await Order.generateOrderId();
    
    let products = [{
      productId: new mongoose.Types.ObjectId(),
      variantId: new mongoose.Types.ObjectId(),
      productName: 'Test Product',
      quantity: 1,
      mrp: 1000,
      salePrice: 900,
      itemTotal: 900,
      discountPercent: 10
    }];
    
    const order = new Order({
      orderId,
      userId: user._id,
      products,
      shippingAddress: {
        fullName: address ? (address.fullName || address.name || 'Guest') : 'Guest',
        phone: address ? address.phone : '123',
        addressLine: address ? address.street : '123',
        city: address ? address.city : 'city',
        state: address ? address.state : 'state',
        pincode: address ? address.pincode : '1234',
        addressType: 'Home'
      },
      paymentMethod: 'COD',
      paymentDetails: {},
      orderStatus: 'Pending',
      deliveryType: 'Normal',
      subtotalMrp: 1000,
      discount: 100,
      couponDiscount: 0,
      deliveryCharge: 0,
      codCharge: 30,
      cgst: 90,
      sgst: 90,
      totalAmount: 1110,
      estimatedDelivery: new Date(),
      trackingTimeline: [{ status: 'Pending', message: 'Order placed successfully', timestamp: new Date(), completed: true }]
    });

    await order.save();
    console.log('Order saved successfully');
  } catch (err) {
    console.error('TEST SCRIPT ERROR:', err);
  }
  process.exit();
}

test();
