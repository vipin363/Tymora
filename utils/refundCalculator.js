import Coupon from '../model/couponModel.js';
import Offer from '../model/offerModel.js';


export const calculateRefundAmount = async (order, itemIdToRefund, returnQuantity = null) => {
  try {
    const item = order.products.find(p => p._id.toString() === itemIdToRefund);
    if (!item) throw new Error("Item not found in order");

    const qtyToRefund = returnQuantity || item.quantity;

    // 1. Base refund = what the customer actually paid for this item (proportional to qty)
    //    productFinalPaidPrice = itemTotal - couponShare - offerShare (already excludes discount)
    // 1. Calculate Original Customer Payment (Total actually paid, excluding previously refunded amounts conceptually)
    // Actually, order.totalAmount is the absolute truth of what they paid initially.
    const originalTotalPaid = order.totalAmount;

    // 2. Calculate Total Refunded So Far
    // Sum of all refundAmountProcessed on all items. 
    // (Note: we don't count the current item yet, as it hasn't been processed).
    let totalRefundedSoFar = 0;
    order.products.forEach(p => {
      totalRefundedSoFar += (p.refundAmountProcessed || 0);
    });

    // 3. Determine Kept Quantities and Kept Subtotals
    let keptSubtotal = 0;
    let offerKeptSubtotal = 0; // Subtotal of kept items that were eligible for the offer
    let activeProductsRemaining = 0;

    order.products.forEach(p => {
      let keptQty = p.quantity;
      if (p.orderStatus === 'Cancelled' || p.orderStatus === 'Returned') keptQty = 0;
      if (p._id.toString() === itemIdToRefund) keptQty -= qtyToRefund;
      
      if (keptQty > 0) {
        keptSubtotal += p.salePrice * keptQty;
        activeProductsRemaining += keptQty;
        // If the item originally received a share of the offer, it was eligible
        if (p.offerDiscountShare && p.offerDiscountShare > 0) {
          offerKeptSubtotal += p.salePrice * keptQty;
        }
      }
    });

    // 4. Recalculate Expected Allowed Discounts on Kept Items
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
          // If it's a fixed offer, we apply it fully as long as threshold is met
          allowedOffer = offer.discountValue;
        }
        // Ensure offer discount doesn't exceed the applicable subtotal
        if (allowedOffer > offerKeptSubtotal) allowedOffer = offerKeptSubtotal;
      }
    }

    // 5. Calculate Expected Payment for Remaining Items
    // The customer should pay: (Kept Subtotal - Discounts) + Proportional Kept GST + Delivery + COD
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

    // 6. Calculate Refund Owed to satisfy the Financial Integrity Rule
    // Total Refunded So Far + Current Expected Payment + THIS REFUND = Original Customer Payment
    // Therefore: THIS REFUND = Original Payment - Expected Payment - Total Refunded So Far
    
    // Calculate total theoretical refund owed for all cancelled/returned items up to this point
    const totalRefundOwed = originalTotalPaid - expectedPayment;
    
    // The refund for this specific operation
    let refundAmount = totalRefundOwed - totalRefundedSoFar;

    // Safety clamps
    if (refundAmount < 0) refundAmount = 0;
    
    // Check if threshold was broken to inform the UI (purely for messaging)
    const thresholdBroken = (order.couponCode && allowedCoupon === 0 && order.couponDiscount > 0) || 
                            (order.offerId && allowedOffer === 0 && order.offerDiscount > 0);

    return {
      refundAmount,
      thresholdBroken,
      lostDiscountValue: 0 // No longer used as a deducted penalty, the math natively absorbs it
    };

  } catch (error) {
    console.error("Refund Calculation Error:", error);
    throw error;
  }
};
