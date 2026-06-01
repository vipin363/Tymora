import Coupon from '../model/couponModel.js';
import Offer from '../model/offerModel.js';


export const calculateRefundAmount = async (order, itemIdToRefund, returnQuantity = null) => {
  try {
    const item = order.products.find(p => p._id.toString() === itemIdToRefund);
    if (!item) throw new Error("Item not found in order");

    
    const qtyToRefund = returnQuantity || item.quantity;
    const isPartialQuantity = qtyToRefund < item.quantity;

    // 1. Basic Paid Amount for this specific quantity
    const proportionalFinalPaid = item.productFinalPaidPrice > 0 
      ? (item.productFinalPaidPrice / item.quantity) * qtyToRefund
      : (item.itemTotal / item.quantity) * qtyToRefund; // Fallback for old orders

    // If no order-level coupon/offer, refund is just proportional paid amount.
    if (!order.couponCode && !order.offerId) {
      return {
         refundAmount: proportionalFinalPaid,
         thresholdBroken: false,
         lostDiscountValue: 0
      };
    }

    // 2. Determine "Active" Products (not cancelled, not fully returned)
    // We want to simulate the order value without the items being returned right now.
    let remainingSubtotal = 0;
    
    order.products.forEach(p => {
      // If it's the item being currently refunded, subtract the quantity being refunded
      let qtyContained = p.quantity;
      if (p.orderStatus === 'Cancelled' || p.orderStatus === 'Returned') {
         qtyContained = 0; // Already refunded previously
      }
      if (p._id.toString() === itemIdToRefund) {
         qtyContained -= qtyToRefund;
      }
      
      if (qtyContained > 0) {
         // Subtotal calculation should ideally be the sum of base sale prices before order-level discounts
         remainingSubtotal += (p.salePrice * qtyContained);
      }
    });

    let thresholdBroken = false;
    let lostDiscountValue = 0;

    // 3. Check Coupon Threshold Breakage
    if (order.couponCode) {
       const coupon = await Coupon.findOne({ couponCode: order.couponCode });
       if (coupon && coupon.minPurchaseAmount > remainingSubtotal) {
          // Threshold broken!
          thresholdBroken = true;
          lostDiscountValue = order.couponDiscount; 
       }
    }

    // 4. Check Offer Threshold Breakage (if offer has minPurchaseAmount)
    if (order.offerId) {
       const offer = await Offer.findById(order.offerId);
       if (offer && offer.minPurchaseAmount > remainingSubtotal) {
          thresholdBroken = true;
          lostDiscountValue = order.offerDiscount;
       }
    }

    // 5. Final Calculation
    let baseRefund = proportionalFinalPaid;
    
    if (thresholdBroken) {
        // If threshold breaks, we must recover the lost discount from this refund
        // Prevent negative refunds
        baseRefund = Math.max(0, baseRefund - lostDiscountValue);
    }

    // 6. Add GST Component
    let gstRefund = 0;
    if ((order.cgst && order.cgst > 0) || (order.sgst && order.sgst > 0)) {
       // GST is calculated as 18% (9% CGST + 9% SGST) of the final discounted price
       gstRefund = Math.round(baseRefund * 0.18);
    }

    let refundAmount = baseRefund + gstRefund;

    return {
       refundAmount,
       thresholdBroken,
       lostDiscountValue
    };

  } catch (error) {
    console.error("Refund Calculation Error:", error);
    throw error;
  }
};
