import express from 'express';
const router = express.Router();
import {
  isLogin,
  isAuth,
  hasOtpSession,
  hasForgotSession,
  hasResetVerified,
} from '../middleware/userAuth.js';
import { clearReferralCookie } from '../middleware/captureReferral.js';
import {
  loadLogin,
  login,
  loadRegister,
  registerUser,
  homePage,
  logout,
  loadForgotPassword,
  forgotPassword,
  loadResetPassword,
  resetPassword,
  loadProfile,
  loadEditProfile,
  updateProfile,
  changeEmail,
  verifyChangeEmail,
  resendChangeEmailOtp,
  deleteAccount,
  changePassword,
  loadAddressPage,
  addAddress,
  updateAddress,
  getAddress,
  setDefaultAddress,
  deleteAddress,
  loadshop,
  loadCollectionPage,
  loadProductDetail,
  loadWishlist,
  toggleWishlist,
  getWishlistIds,
  addAllToCart,
  loadCart,
  loadCheckout,
  calculateCheckout,
  addToCart,
  updateCartItem,
  removeCartItem,
  getCartCount,
  checkProductStatus,
  placeOrder,
  verifyPayment,
  markPaymentFailed,
  loadOrderSuccess,
  loadPaymentFailed,
  getUserOrders,
  buyNow,
  cancelOrder,
  trackOrder,
  downloadInvoice,
  requestReturn,
  loadOrderDetails,
  loadDeals,
  loadAboutUs,
  loadMyCoupons,
  loadMyWallet,
  topUpWallet,
  verifyWalletTopUp,
  loadReferrals,
  googleLoginInit,
  googleRegisterInit,
  googleCallback,
  searchLive,
} from '../controller/userController.js';
import {
  addReview,
  editReview,
  deleteReview,
  getMyReviews,
} from '../controller/reviewController.js';
import {
  loadOtpPage,
  verifyOtp,
  resendOtp,
  loadForgotOtpPage,
  verifyForgotOtp,
} from '../controller/otpController.js';
import passport from 'passport';
import upload from '../middleware/uploard.js';
import { attachCategories } from '../middleware/attachCategories.js';
import Product from '../model/productModel.js';
import Variant from '../model/variantModel.js';
import Wishlist from '../model/wishlistModel.js';
import Cart from '../model/cartModel.js';
import {
  loginLimiter,
  registerLimiter,
  forgotLimiter,
  registerOtpLimiter,
  forgotOtpLimiter,
  registerResendLimiter,
  changeEmailResendLimiter,
} from '../middleware/rateLimiter.js';

router.use(attachCategories);

router.get('/', homePage);
router.get('/api/search-live', searchLive);
router.get('/login', isLogin, loadLogin);
router.post('/login', loginLimiter, login);

router.get('/register', isLogin, loadRegister);
router.post('/register', registerLimiter, registerUser);

router.get('/otp', hasOtpSession, loadOtpPage);
router.post('/verifyOtp', hasOtpSession, registerOtpLimiter, verifyOtp);
router.get('/resendOtp', registerResendLimiter, resendOtp);

router.post('/logout', isAuth, logout);

router.get('/forgotPassword', isLogin, loadForgotPassword);
router.post('/forgotPassword', forgotLimiter, forgotPassword);

router.get('/forgotOtp', hasForgotSession, loadForgotOtpPage);
router.post(
  '/verifyForgotOtp',
  hasForgotSession,
  forgotOtpLimiter,
  verifyForgotOtp
);

router.get('/resetPassword', hasResetVerified, loadResetPassword);
router.post('/resetPassword', hasResetVerified, resetPassword);

router.get('/home', (req, res) => {
  res.redirect('/user/');
});

router.get(
  '/auth/google/login',
  googleLoginInit,
  passport.authenticate('google', { scope: ['profile', 'email'] })
);
router.get(
  '/auth/google/register',
  googleRegisterInit,
  passport.authenticate('google', { scope: ['profile', 'email'] })
);
router.get('/auth/google/callback', googleCallback);

// My Profile
router.get('/profile', isAuth, loadProfile);
router.get('/editProfile', isAuth, loadEditProfile);
router.post(
  '/updateProfile',
  isAuth,
  upload.single('profileImage'),
  updateProfile
);
router.post('/deleteAccount', isAuth, deleteAccount);
router.get('/coupons', isAuth, loadMyCoupons);
router.get('/wallet', isAuth, loadMyWallet);
router.post('/wallet/topup', isAuth, topUpWallet);
router.post('/wallet/verify-topup', isAuth, verifyWalletTopUp);
router.post('/changeEmail', isAuth, changeEmail);
router.post('/verifyEmailOtp', isAuth, verifyChangeEmail);
router.post(
  '/resendEmailOtp',
  isAuth,
  changeEmailResendLimiter,
  resendChangeEmailOtp
);

router.post('/changePassword', isAuth, changePassword);

router.get('/address', isAuth, loadAddressPage);
router.post('/addAddress', isAuth, addAddress);
router.get('/getAddress/:id', isAuth, getAddress);
router.post('/updateAddress/:id', isAuth, updateAddress);
router.get('/setDefault/:id', isAuth, setDefaultAddress);
router.post('/deleteAddress/:id', isAuth, deleteAddress);

router.get('/shop', loadshop);
router.get('/deals', loadDeals);
router.get('/about', loadAboutUs);
router.get('/collection/:collectionId', loadCollectionPage);
router.get('/product/:id', loadProductDetail);

router.get('/wishlist', isAuth, loadWishlist);
router.post('/wishlist/toggle', isAuth, toggleWishlist);
router.get('/wishlist/ids', getWishlistIds);
router.post('/wishlist/add-all', isAuth, addAllToCart);

router.get('/cart', isAuth, loadCart);
router.post('/cart/add', isAuth, addToCart);
router.post('/cart/update', isAuth, updateCartItem);
router.post('/cart/remove', isAuth, removeCartItem);
router.get('/cart/count', getCartCount);

router.post('/checkout/buy-now', isAuth, buyNow);
router.get('/checkout', isAuth, loadCheckout);
router.post('/checkout/calculate', isAuth, calculateCheckout);
router.post('/checkout/place-order', isAuth, placeOrder);
router.post('/checkout/verify-payment', isAuth, verifyPayment);
router.post('/checkout/mark-payment-failed', isAuth, markPaymentFailed);

router.get('/order-success', isAuth, loadOrderSuccess);
router.get('/payment-failed', isAuth, loadPaymentFailed);
router.get('/orders', isAuth, getUserOrders);
router.get('/order-details/:orderId', isAuth, loadOrderDetails);
router.get('/track-order/:orderId/:itemId', isAuth, trackOrder);
router.get('/orders/invoice/:orderId', isAuth, downloadInvoice);
router.post('/orders/cancel', isAuth, cancelOrder);
router.post(
  '/orders/return',
  isAuth,
  upload.array('evidenceImages', 3),
  requestReturn
);
router.get('/referrals', isAuth, loadReferrals);

router.post('/reviews/add', isAuth, addReview);
router.post('/reviews/edit/:reviewId', isAuth, editReview);
router.post('/reviews/delete/:reviewId', isAuth, deleteReview);
router.get('/my-reviews', isAuth, getMyReviews);

// GET /user/api/related/:productId
router.get('/api/product-status/:id', checkProductStatus);

router.get('/api/related/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.session.user?.id;
    const TARGET = 4;

    const current = await Product.findOne({
      _id: productId,
      status: 'active',
      deleted_at: null,
    })
      .populate('brand', 'name')
      .lean();

    if (!current) return res.json({ success: false, products: [] });

    const excludedIds = [current._id.toString()];

    async function fetchCandidates(filter, limit) {
      const raw = await Product.find({
        ...filter,
        _id: { $nin: excludedIds },
        status: 'active',
        deleted_at: null,
      })
        .populate('brand', 'name')
        .limit(limit * 3)
        .lean();

      if (!raw.length) return [];

      const variantDocs = await Variant.find({
        product: { $in: raw.map((p) => p._id) },
        status: 'active',
        deleted_at: null,
      }).lean();

      const hasVariant = new Set(variantDocs.map((v) => v.product.toString()));
      const varMap = {};
      variantDocs.forEach((v) => {
        const pid = v.product.toString();
        if (!varMap[pid] || v.isDefault) varMap[pid] = v;
      });

      return raw
        .filter((p) => hasVariant.has(p._id.toString()))
        .slice(0, limit)
        .map((p) => ({ product: p, variant: varMap[p._id.toString()] }));
    }

    let slots = [];

    if (current.category) {
      const catResults = await fetchCandidates(
        { category: current.category },
        TARGET
      );
      slots.push(...catResults);
      catResults.forEach((r) => excludedIds.push(r.product._id.toString()));
    }

    if (slots.length < TARGET && current.brand?._id) {
      const brandResults = await fetchCandidates(
        { brand: current.brand._id },
        TARGET - slots.length
      );
      slots.push(...brandResults);
      brandResults.forEach((r) => excludedIds.push(r.product._id.toString()));
    }

    if (slots.length < TARGET && current.gender) {
      const genderResults = await fetchCandidates(
        { gender: current.gender },
        TARGET - slots.length
      );
      slots.push(...genderResults);
    }

    if (!slots.length) return res.json({ success: true, products: [] });

    // ── Fetch wishlist + cart state ───────────────────────────────
    let wishedSet = new Set();
    let cartVariantSet = new Set();

    if (userId) {
      const [wl, cart] = await Promise.all([
        Wishlist.findOne({ userId }).lean(),
        Cart.findOne({ userId }).lean(),
      ]);
      if (wl?.products?.length) {
        wishedSet = new Set(wl.products.map((p) => p.productId.toString()));
      }
      if (cart?.items?.length) {
        cartVariantSet = new Set(cart.items.map((i) => i.variantId.toString()));
      }
    }

    // ── Badge helper ──────────────────────────────────────────────
    const DEFAULT_BADGES = [
      'CURATED',
      'PREMIUM',
      'SIGNATURE',
      'CLASSIC',
      'LUXURY PICK',
    ];

    function buildBadge(p, rv) {
      const stock = rv?.stock ?? 0;
      const hoursSince = p.createdAt
        ? (Date.now() - new Date(p.createdAt).getTime()) / 3_600_000
        : 9999;
      const seed = parseInt(p._id.toString().slice(-2), 16) || 0;
      if (p.dealOfTheDay)
        return { badge: 'deal', badgeLabel: 'DEAL OF THE DAY' };
      if (p.featured) return { badge: 'featured', badgeLabel: 'BEST PICK' };
      if (stock > 0 && stock <= 5)
        return { badge: 'low-stock', badgeLabel: `ONLY ${stock} LEFT` };
      if (hoursSince <= 24) return { badge: 'new', badgeLabel: 'NEW' };
      return {
        badge: 'default',
        badgeLabel: DEFAULT_BADGES[seed % DEFAULT_BADGES.length],
      };
    }

    // ── Shape response ────────────────────────────────────────────
    const products = slots.map(({ product: p, variant: rv }) => {
      const { badge, badgeLabel } = buildBadge(p, rv);
      const pid = p._id.toString();
      const vid = rv._id.toString();
      return {
        id: pid,
        name: p.name,
        brand: p.brand?.name || 'TYMORA',
        price: rv.salePrice ?? rv.price ?? p.price ?? 0,
        oldPrice:
          (p.discountPercentage ?? p.discount) > 0
            ? (rv.originalPrice ?? p.originalPrice ?? null)
            : null,
        discountPct: p.discountPercentage ?? p.discount ?? 0,
        rating: p.rating ?? 4.5,
        reviews: p.reviews ?? 0,
        badge,
        badgeLabel,
        avail: rv.stock > 0 ? 'instock' : 'outofstock',
        img: rv.images?.[0] || p.images?.[0] || '',
        variantId: vid,
        wished: wishedSet.has(pid),
        inCart: cartVariantSet.has(vid),
      };
    });

    return res.json({ success: true, products });
  } catch (err) {
    console.error('related API error:', err);
    return res.json({ success: false, products: [] });
  }
});

export default router;
