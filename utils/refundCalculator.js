import Coupon from '../model/couponModel.js';
import Offer from '../model/offerModel.js';


export const calculateRefundAmount = async (order, itemIdToRefund, returnQuantity = null) => {
  try {
    const item = order.products.find(p => p._id.toString() === itemIdToRefund);
    if (!item) throw new Error("Item not found in order");

    const qtyToRefund = returnQuantity || item.quantity;

    
    const originalTotalPaid = order.totalAmount;

    let totalRefundedSoFar = 0;
    order.products.forEach(p => {
      totalRefundedSoFar += (p.refundAmountProcessed || 0);
    });

   
    let keptSubtotal = 0;
    let offerKeptSubtotal = 0; 
    let activeProductsRemaining = 0;

    order.products.forEach(p => {
      let keptQty = p.quantity;
      if (p.orderStatus === 'Cancelled' || p.orderStatus === 'Returned') keptQty = 0;
      if (p._id.toString() === itemIdToRefund) keptQty -= qtyToRefund;
      
      if (keptQty > 0) {
        keptSubtotal += p.salePrice * keptQty;
        activeProductsRemaining += keptQty;
       
        if (p.offerDiscountShare && p.offerDiscountShare > 0) {
          offerKeptSubtotal += p.salePrice * keptQty;
        }
      }
    });

    
    let allowedCoupon = 0;
    if (order.couponCode && keptSubtotal > 0) {
      const coupon = await Coupon.findOne({ code: order.couponCode });
      if (coupon && keptSubtotal >= (coupon.minPurchase || 0)) {
        if (coupon.discountType === 'percentage') {
          allowedCoupon = (keptSubtotal * coupon.discountValue) / 100;
          if (coupon.maxDiscount && allowedCoupon > coupon.maxDiscount) {
            allowedCoupon = coupon.maxDiscount;
          }
        } else {
          allowedCoupon = coupon.discountValue;
        }
      }
    }

    let allowedOffer = 0;
    if (order.offerId && offerKeptSubtotal > 0) {
      const offer = await Offer.findById(order.offerId);
      if (offer && offerKeptSubtotal >= (offer.minPurchaseAmount || 0)) {
        if (offer.discountType === 'percentage') {
          allowedOffer = (offerKeptSubtotal * offer.discountValue) / 100;
          if (offer.maxDiscountLimit && allowedOffer > offer.maxDiscountLimit) {
            allowedOffer = offer.maxDiscountLimit;
          }
        } else {
         
          allowedOffer = offer.discountValue;
        }
       
        if (allowedOffer > offerKeptSubtotal) allowedOffer = offerKeptSubtotal;
      }
    }

    
    const expectedBasePrice = Math.max(0, keptSubtotal - allowedCoupon - allowedOffer);
    
    let expectedGst = 0;
    if ((order.cgst && order.cgst > 0) || (order.sgst && order.sgst > 0)) {
      expectedGst = Math.round(expectedBasePrice * 0.18);
    }

    let expectedFees = 0;
    if (activeProductsRemaining > 0) {
      if (order.deliveryCharge) expectedFees += order.deliveryCharge;
      if (order.codCharge) expectedFees += order.codCharge;
    }

    const expectedPayment = expectedBasePrice + expectedGst + expectedFees;

    
    const totalRefundOwed = originalTotalPaid - expectedPayment;
    
    let refundAmount = totalRefundOwed - totalRefundedSoFar;

    if (refundAmount < 0) refundAmount = 0;
    
   
    const thresholdBroken = (order.couponCode && allowedCoupon === 0 && order.couponDiscount > 0) || 
                            (order.offerId && allowedOffer === 0 && order.offerDiscount > 0);

    return {
      refundAmount,
      thresholdBroken,
      lostDiscountValue: 0 
    };

  } catch (error) {
    console.error("Refund Calculation Error:", error);
    throw error;
  }
};
