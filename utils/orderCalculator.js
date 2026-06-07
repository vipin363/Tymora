import mongoose from 'mongoose';

export const calculateActiveOrderTotals = async (order, activeProducts) => {
  let computedSubtotal = 0;
  let offerInvoiceSubtotal = 0;

  activeProducts.forEach(item => {
    const itemTotal = item.salePrice * item.quantity;
    computedSubtotal += itemTotal;
    if (item.offerDiscountShare && item.offerDiscountShare > 0) {
      offerInvoiceSubtotal += itemTotal;
    }
  });

  let invoiceCouponDiscount = 0;
  if (order.couponCode && computedSubtotal > 0) {
    const Coupon = mongoose.model('Coupon');
    const coupon = await Coupon.findOne({ code: order.couponCode });
    if (coupon && computedSubtotal >= (coupon.minPurchase || 0)) {
      if (coupon.discountType === 'percentage') {
        invoiceCouponDiscount = (computedSubtotal * coupon.discountValue) / 100;
        if (coupon.maxDiscount && invoiceCouponDiscount > coupon.maxDiscount) {
          invoiceCouponDiscount = coupon.maxDiscount;
        }
      } else {
        invoiceCouponDiscount = coupon.discountValue;
      }
    }
  }

  let invoiceOfferDiscount = 0;
  if (order.offerId && offerInvoiceSubtotal > 0) {
    const Offer = mongoose.model('Offer');
    const offer = await Offer.findById(order.offerId);
    if (offer && offerInvoiceSubtotal >= (offer.minPurchaseAmount || 0)) {
      if (offer.discountType === 'percentage') {
        invoiceOfferDiscount = (offerInvoiceSubtotal * offer.discountValue) / 100;
        if (offer.maxDiscountLimit && invoiceOfferDiscount > offer.maxDiscountLimit) {
          invoiceOfferDiscount = offer.maxDiscountLimit;
        }
      } else {
        invoiceOfferDiscount = offer.discountValue;
      }
      if (invoiceOfferDiscount > offerInvoiceSubtotal) {
        invoiceOfferDiscount = offerInvoiceSubtotal;
      }
    }
  }

  const expectedBasePrice = Math.max(0, computedSubtotal - invoiceCouponDiscount - invoiceOfferDiscount);
  
  let invoiceCgst = 0;
  let invoiceSgst = 0;
  if ((order.cgst && order.cgst > 0) || (order.sgst && order.sgst > 0)) {
    const totalGst = Math.round(expectedBasePrice * 0.18);
    invoiceCgst = totalGst / 2;
    invoiceSgst = totalGst / 2;
  }

  let deliveryCharge = 0;
  let codCharge = 0;
  if (activeProducts.length > 0) {
    deliveryCharge = order.deliveryCharge || 0;
    codCharge = order.codCharge || 0;
  }

  const finalAmountPaid = expectedBasePrice + invoiceCgst + invoiceSgst + deliveryCharge + codCharge;

  return {
    computedSubtotal,
    invoiceCouponDiscount,
    invoiceOfferDiscount,
    invoiceCgst,
    invoiceSgst,
    deliveryCharge,
    codCharge,
    finalAmountPaid
  };
};
