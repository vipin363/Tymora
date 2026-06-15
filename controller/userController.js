import userSchema from '../model/userModel.js';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import cloudinary from '../config/cloudinary.js';
import addressModel from '../model/addressModel.js';
import { generateAndSaveOtp, verifyOtpFromDb } from '../services/otpService.js';
import Category from '../model/categoryModel.js';
import Brand from '../model/brandModel.js';
import Product from '../model/productModel.js';
import Variant from '../model/variantModel.js';
import Wishlist from '../model/wishlistModel.js';
import Cart from '../model/cartModel.js';
import Order from '../model/orderModel.js';
import PDFDocument from 'pdfkit';
import Settings from '../model/settingsModel.js';
import Review from '../model/reviewModel.js';
import Coupon from '../model/couponModel.js';
import Offer from '../model/offerModel.js';
import WalletTransaction from '../model/walletTransactionModel.js';
import Referral from '../model/referralModel.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { calculateRefundAmount } from '../utils/refundCalculator.js';
import { calculateActiveOrderTotals } from '../utils/orderCalculator.js';
import {
  getReferralCode,
  clearReferralCookie,
} from '../middleware/captureReferral.js';
import passport from 'passport';

// user auth and profile

export const loadRegister = async (req, res) => {
  let message = req.query.message || '';
  // Detailed referral debug trace
  console.log(`[Register] Page loaded | URL: ${req.originalUrl}`);
  console.log(`[Register] req.query.ref = ${req.query.ref || 'none'}`);
  console.log(
    `[Register] req.cookies._tyref = ${req.cookies?._tyref || 'none'}`
  );
  // Cookie is the primary source; URL ?ref= is the fallback (and sets the cookie via middleware)
  const prefillRef = (req.query.ref || req.cookies?._tyref || '').toUpperCase();
  console.log(`[Register] prefillRef resolved to: ${prefillRef || 'none'}`);
  res.render('user/register', { layout: 'auth', message, prefillRef });
};

export const googleLoginInit = (req, res, next) => {
  console.log('[Google OAuth] Login flow initiated');
  req.session.googleAuthType = 'login';
  req.session.save((err) => {
    if (err) {
      console.error(err);
      return res.redirect('/user/login');
    }

    next();
  });
};

export const googleRegisterInit = (req, res, next) => {
  console.log('[Google OAuth] Register flow initiated');
  req.session.googleAuthType = 'register';

  req.session.save((err) => {
    if (err) {
      console.error(err);
      return res.redirect('/user/register');
    }

    next();
  });
};

export const googleCallback = (req, res, next) => {
  passport.authenticate('google', (err, user, info) => {
    console.log('SESSION googleAuthType:', req.session.googleAuthType);
    console.log('QUERY state:', req.query.state);

    if (err) return next(err);

    const isRegister = req.session.googleAuthType === 'register';

    // Clean up the temporary flag
    delete req.session.googleAuthType;

    if (!user) {
      console.log('[Google OAuth] Auth failed:', info?.message);

      return req.session.save(() => {
        if (isRegister) {
          return res.redirect(
            `/user/register?message=${encodeURIComponent(
              info?.message || 'Registration failed'
            )}`
          );
        }

        return res.redirect(
          `/user/login?message=${encodeURIComponent(
            info?.message || 'Login failed'
          )}`
        );
      });
    }

    // Save logged in user
    req.session.user = {
      id: user._id,
      name: user.name,
    };

    console.log('CALLBACK SESSION ID:', req.sessionID);
    console.log('CALLBACK SESSION USER:', req.session.user);

    if (isRegister) {
      clearReferralCookie(res);
      console.log(`[Google OAuth] Referral cookie cleared after registration.`);
    }

    req.session.save((err) => {
      if (err) {
        console.error('[Google OAuth] Session save failed:', err);

        return res.redirect('/user/login?message=Session error');
      }

      console.log(
        `[Google OAuth] Session saved successfully for ${user.email}`
      );

      return res.redirect('/user/home');
    });
  })(req, res, next);
};

export const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Form field is the explicit choice; cookie is the fallback
    const formCode = (req.body.referralCode || '').trim().toUpperCase();
    const cookieCode = getReferralCode(req) || '';
    const referralCode = formCode || cookieCode;
    const referralSource = formCode ? 'Code' : 'Link';

    console.log(`[Register] Attempt: email=${email}`);
    console.log(
      `[Register] formCode (from form field) = ${formCode || 'none'}`
    );
    console.log(
      `[Register] cookieCode (_tyref cookie) = ${cookieCode || 'none'}`
    );
    console.log(`[Register] referralCode resolved = ${referralCode || 'none'}`);
    console.log(`[Register] referralSource = ${referralSource}`);

    const user = await userSchema.findOne({ email });
    if (user) {
      return res.render('user/login', {
        layout: 'auth',
        message: 'user already exists',
      });
    }

    const passwordPattern =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
    if (!passwordPattern.test(password)) {
      return res.render('user/register', {
        layout: 'auth',
        message:
          'Password must be strong (uppercase, lowercase, number, symbol)',
        prefillRef: referralCode,
      });
    }

    let referrerId = null;
    let referralCodeUsed = null;

    if (referralCode) {
      const settings = await Settings.findOne();
      if (settings && !settings.referralProgramEnabled) {
        console.log(`[Register] Referral program disabled – ignoring code`);
        // Don't block registration, just skip referral
      } else {
        const referrer = await userSchema.findOne({ referralCode });
        if (!referrer) {
          console.log(`[Register] Invalid referral code: ${referralCode}`);
          return res.render('user/register', {
            layout: 'auth',
            message: 'Invalid referral code. Please check and try again.',
            prefillRef: referralCode,
          });
        }
        // Self-referral check
        if (referrer.email === email) {
          console.log(`[Register] Self-referral attempt detected - skipping.`);
        } else {
          // Duplicate check: has this email already been referred?
          const alreadyReferred = await Referral.findOne({
            referredEmail: email,
          });
          if (alreadyReferred) {
            console.log(
              `[Register] Duplicate referral attempt detected (email already referred) – skipping.`
            );
          } else {
            referrerId = referrer._id;
            referralCodeUsed = referralCode;
            console.log(
              `[Register] Referral valid – referrer: ${referrer.email}`
            );
          }
        }
      }
    }

    req.session.userData = {
      name,
      email,
      password,
      referrerId,
      referralCodeUsed,
      referralSource,
    };
    await generateAndSaveOtp({ email, purpose: 'register' });
    req.session.changeEmailLink = '/user/register';
    console.log(`[Register] OTP sent to: ${email}`);
    res.redirect('/user/otp');
  } catch (err) {
    console.error('registerUser error:', err);
    res.render('user/register', {
      layout: 'auth',
      message: 'Something went wrong',
    });
  }
};

export const loadLogin = async (req, res) => {
  let message = null;
  let success = false;

  if (req.query.message) {
    message = req.query.message;
  }

  if (req.query.success) {
    success = true;
  }
  if (req.query.msg === 'blocked') {
    message = 'Your account has been blocked by admin';
  }

  res.render('user/login', { layout: 'auth', message, success });
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await userSchema.findOne({ email });
    if (!user) {
      return res.render('user/login', {
        layout: 'auth',
        message: 'User not exists',
      });
    }

    if (user.isBlocked) {
      return res.render('user/login', {
        layout: 'auth',
        message: 'Your account is blocked by the Admin',
      });
    }

    if (!user.password) {
      return res.render('user/login', {
        layout: 'auth',
        message:
          'You registered using Google. Please login with Google and set your password in profile or please continue with forgot password.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.render('user/login', {
        layout: 'auth',
        message: 'Incorrect password',
      });
    }

    req.session.user = {
      id: user._id,
      name: user.name,
    };

    res.redirect('/user/');
  } catch (err) {
    res.render('user/login', {
      layout: 'auth',
      message: 'Something went wrong',
    });
  }
};

export const homePage = async (req, res) => {
  try {
    console.log('HOME SESSION:', req.session.user);
    console.log('HOME SESSION ID:', req.sessionID);
    let message = req.query.message || null;
    // Find category IDs that have at least one active product with active variants
    const activeCategoryIds = await Product.distinct('category', {
      status: 'active',
      deleted_at: null,
    });
    // only categories whose products have at least one active variant
    const productsWithActiveVariants = await Variant.distinct('product', {
      status: 'active',
      deleted_at: null,
    });
    const productIdsWithVariants = await Product.distinct('_id', {
      _id: { $in: productsWithActiveVariants },
      status: 'active',
      deleted_at: null,
    });
    const validCategoryIds = await Product.distinct('category', {
      _id: { $in: productIdsWithVariants },
      status: 'active',
      deleted_at: null,
    });
    const rawCategories = await Category.find({
      _id: { $in: validCategoryIds },
      is_visible: true,
      deleted_at: null,
    })
      .sort({ createdAt: -1 })
      .lean();
    const navCategories = rawCategories.map((c) => ({
      _id: c._id.toString(),
      name: c.name,
      image: c.image_url || '',
    }));

    if (req.session.user) {
      const user = await userSchema.findById(req.session.user.id);
      if (!user) {
        req.session.user = null;
        return res.render('user/home', {
          layout: 'main',
          user: null,
          message: 'Your account has been deleted by admin',
          navCategories,
          categories: navCategories,
          trendingProducts: [],
          testimonials: [],
        });
      }
      if (user.isBlocked) {
        req.session.user = null;
        return res.render('user/home', {
          layout: 'main',
          user: null,
          message: 'Your account has been blocked by admin',
          navCategories,
          categories: navCategories,
          trendingProducts: [],
          testimonials: [],
        });
      }
    }

    // ── Fetch Trending Products (up to 8) ──
    const trendingRaw = await Product.find({
      _id: { $in: productIdsWithVariants },
      status: 'active',
      deleted_at: null,
    })
      .populate('brand', 'name')
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();

    const trendingProducts = [];
    for (const p of trendingRaw) {
      const variant = await Variant.findOne({
        product: p._id,
        status: 'active',
        deleted_at: null,
      })
        .sort({ isDefault: -1 })
        .lean();
      if (!variant) continue;
      const salePrice = variant.salePrice || variant.price || 0;
      const originalPrice = variant.originalPrice || salePrice;
      const discountPct = variant.discountPercentage || 0;
      trendingProducts.push({
        _id: p._id.toString(),
        name: p.name,
        brand: p.brand?.name || 'TYMORA',
        image: variant.images?.[0] || p.images?.[0] || '',
        salePrice,
        originalPrice,
        discountPct,
        hasDiscount: discountPct > 0,
        rating: p.rating || 0,
        reviewCount: p.reviews || 0,
        variantId: variant._id.toString(),
        badge: p.featured
          ? 'Featured'
          : discountPct >= 20
            ? `${discountPct}% OFF`
            : '',
        hasBadge: p.featured || discountPct >= 20,
      });
    }

    // ── Fetch Testimonials (real 4-5 star reviews, up to 6) ──
    const rawReviews = await Review.find({
      rating: { $gte: 4 },
      isVisible: true,
    })
      .populate('userId', 'name avatar')
      .populate('productId', 'name')
      .sort({ createdAt: -1 })
      .limit(6)
      .lean();

    const testimonials = rawReviews.map((r) => ({
      rating: r.rating,
      stars: '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating),
      text: r.reviewText,
      userName: r.userId?.name || 'Valued Customer',
      avatar: r.userId?.avatar || null,
      initials: (r.userId?.name || 'VC')
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .substring(0, 2),
      productName: r.productId?.name || 'Premium Watch',
      date: new Date(r.createdAt).toLocaleDateString('en-GB', {
        month: 'short',
        year: 'numeric',
      }),
    }));
    // ── Calculate Dynamic Stats ──
    const happyCustomersCount = await userSchema.countDocuments({});

    // Watches sold: Total quantity of products in delivered orders
    const watchesSoldResult = await Order.aggregate([
      { $match: { 'products.orderStatus': 'Delivered' } },
      { $unwind: '$products' },
      { $match: { 'products.orderStatus': 'Delivered' } },
      { $group: { _id: null, totalSold: { $sum: '$products.quantity' } } },
    ]);
    const watchesSold =
      watchesSoldResult.length > 0 ? watchesSoldResult[0].totalSold : 0;

    // Premium Collections
    const premiumCollections = validCategoryIds.length;

    // Customer Satisfaction: % of 4+ star reviews
    const totalReviews = await Review.countDocuments({ isVisible: true });
    const positiveReviews = await Review.countDocuments({
      rating: { $gte: 4 },
      isVisible: true,
    });
    const customerSatisfaction =
      totalReviews > 0
        ? Math.round((positiveReviews / totalReviews) * 100)
        : 99; // Default to 99 if no reviews

    const stats = {
      happyCustomers: happyCustomersCount,
      watchesSold: watchesSold,
      premiumCollections: premiumCollections,
      customerSatisfaction: customerSatisfaction,
    };

    // ── Fetch Deal of the Day Products ──
    const dealRaw = await Product.find({
      _id: { $in: productIdsWithVariants },
      status: 'active',
      deleted_at: null,
      dealOfTheDay: true,
    })
      .populate('brand', 'name')
      .sort({ createdAt: -1 })
      .lean();

    let wishedSet = new Set();
    let cartVariantSet = new Set();
    if (req.session.user) {
      const [wl, cart] = await Promise.all([
        Wishlist.findOne({ userId: req.session.user.id }).lean(),
        Cart.findOne({ userId: req.session.user.id }).lean(),
      ]);
      if (wl?.products?.length) {
        wishedSet = new Set(wl.products.map((p) => p.productId.toString()));
      }
      if (cart?.items?.length) {
        cartVariantSet = new Set(cart.items.map((i) => i.variantId.toString()));
      }
    }

    const dealOfTheDayProducts = [];
    for (const p of dealRaw) {
      const variant = await Variant.findOne({
        product: p._id,
        status: 'active',
        deleted_at: null,
      })
        .sort({ isDefault: -1 })
        .lean();
      if (!variant) continue;
      const salePrice = variant.salePrice || variant.price || 0;
      const originalPrice = variant.originalPrice || salePrice;
      const discountPct = variant.discountPercentage || 0;
      dealOfTheDayProducts.push({
        id: p._id.toString(),
        name: p.name,
        brand: p.brand?.name || 'TYMORA',
        img: variant.images?.[0] || p.images?.[0] || '',
        price: salePrice,
        oldPrice: discountPct > 0 ? originalPrice : null,
        discountPct: discountPct,
        rating: p.rating || 4.5,
        reviews: p.reviews || 0,
        variantId: variant._id.toString(),
        avail: variant.stock > 0 ? 'instock' : 'outofstock',
        badge: 'deal',
        badgeLabel: 'DEAL OF THE DAY',
        wished: wishedSet.has(p._id.toString()),
        inCart: cartVariantSet.has(variant._id.toString()),
      });
    }

    res.render('user/home', {
      layout: 'main',
      user: req.session.user || null,
      message,
      navCategories,
      categories: navCategories,
      trendingProducts,
      hasProducts: trendingProducts.length > 0,
      dealOfTheDayProducts,
      hasDeals: dealOfTheDayProducts.length > 0,
      testimonials,
      hasTestimonials: testimonials.length > 0,
      stats,
    });
  } catch (err) {
    console.log('homePage error:', err);
    res.render('user/home', {
      layout: 'main',
      user: null,
      message: 'Something went wrong',
      navCategories: [],
      categories: [],
      trendingProducts: [],
      dealOfTheDayProducts: [],
      hasDeals: false,
      testimonials: [],
      stats: {
        happyCustomers: 0,
        watchesSold: 0,
        premiumCollections: 0,
        customerSatisfaction: 0,
      },
    });
  }
};

export const logout = (req, res) => {
  req.session.user = null;
  res.redirect('/user/?message=Logged out successfully');
};

export const loadForgotPassword = (req, res) => {
  res.render('user/forgotpassword', { layout: 'auth' });
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.render('user/forgotpassword', {
        layout: 'auth',
        message: 'Email required',
      });
    }

    const user = await userSchema.findOne({ email });

    if (!user) {
      return res.render('user/forgotpassword', {
        layout: 'auth',
        message: 'Email not registered',
      });
    }

    if (!user.password) {
      return res.render('user/forgotpassword', {
        layout: 'auth',
        message: 'You registered using Google. Please login with Google.',
      });
    }
    req.session.userData = null;

    req.session.resetEmail = email;

    await generateAndSaveOtp({ email, purpose: 'forgot_password' });

    await new Promise((resolve) => req.session.save(resolve));
    req.session.changeEmailLink = '/user/forgotpassword';
    return res.redirect('/user/forgotOtp');
  } catch (err) {
    console.log(err);
    return res.render('user/forgotpassword', {
      layout: 'auth',
      message: 'Something went wrong',
    });
  }
};

export const loadResetPassword = (req, res) => {
  res.render('user/resetpassword', { layout: 'auth' });
};

export const resetPassword = async (req, res) => {
  try {
    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
      return res.render('user/resetpassword', {
        layout: 'auth',
        message: 'Passwords do not match',
      });
    }

    if (password !== confirmPassword) {
      return res.render('user/resetpassword', {
        layout: 'auth',
        message: 'Passwords do not match',
      });
    }

    const passwordPattern =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

    if (!passwordPattern.test(password)) {
      return res.render('user/resetpassword', {
        layout: 'auth',
        message: 'Strong password required',
      });
    }

    const hashed = await bcrypt.hash(password, 10);

    await userSchema.updateOne(
      { email: req.session.resetEmail },
      { $set: { password: hashed } }
    );

    req.session.resetEmail = null;
    req.session.resetVerified = null;
    return res.redirect(
      '/user/login?message=Password changed successfully&success=true'
    );
  } catch (err) {
    console.log(err);

    return res.render('user/resetpassword', {
      layout: 'auth',
      message: 'Something went wrong',
    });
  }
};

export const loadProfile = async (req, res) => {
  try {
    let user = await userSchema.findById(req.session.user.id).lean();

    if (user?.dob) {
      user.dob = new Date(user.dob).toLocaleDateString('en-GB');
    }

    // Referral stats for snippet
    const allReferrals = await Referral.find({ referrer: user._id })
      .populate('referredUser', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    const totalEarned = allReferrals
      .filter((r) => r.rewardStatus === 'COMPLETED')
      .reduce((sum, r) => sum + (r.referrerRewardAmount || 0), 0);

    const referralStats = {
      total: allReferrals.length,
      released: allReferrals.filter((r) => r.rewardStatus === 'COMPLETED')
        .length,
      pending: allReferrals.filter((r) => r.rewardStatus === 'PENDING').length,
      totalEarned,
      recent: allReferrals.slice(0, 3),
    };

    // Order stats for top strip
    const orders = await Order.find({
      userId: user._id,
      'products.orderStatus': 'Delivered',
    }).lean();
    const totalSpent = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
    const activeReturns = await Order.countDocuments({
      userId: user._id,
      'products.orderStatus': {
        $in: ['Return Requested', 'Return Approved', 'Return Picked'],
      },
    });

    res.render('user/userprofile', {
      layout: 'main',
      user,
      hasPassword: !!user.password,
      isGoogleUser: !user.password,
      referralStats,
      stats: {
        watchesOwned: orders.reduce((s, o) => s + (o.products?.length || 0), 0),
        totalSpent: `₹${totalSpent.toLocaleString('en-IN')}`,
        activeReturns,
      },
    });
  } catch (err) {
    console.error('loadProfile error:', err);
    res.redirect('/user/');
  }
};

export const loadReferrals = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const user = await userSchema.findById(userId).lean();
    if (!user) return res.redirect('/user/login');

    const settings = await Settings.findOne().lean();
    const referralUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/user/register?ref=${user.referralCode}`;

    const allReferrals = await Referral.find({ referrer: userId })
      .populate('referredUser', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // For each referral, check the referred user's first order status
    const fmtDate = (d) =>
      d
        ? new Date(d).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
        : '-';

    const referralsFormatted = await Promise.all(
      allReferrals.map(async (r) => {
        const firstOrder = await Order.findOne({ userId: r.referredUser?._id })
          .sort({ createdAt: 1 })
          .lean();
        let firstOrderStatus = 'No Orders Yet';
        if (firstOrder) {
          const allStatuses = firstOrder.products.map((p) => p.orderStatus);
          const hasDelivered = allStatuses.includes('Delivered');
          firstOrderStatus = hasDelivered
            ? 'Delivered'
            : allStatuses[0] || 'Pending';
        }
        return {
          ...r,
          signupDate: fmtDate(r.createdAt),
          firstOrderStatus,
        };
      })
    );

    const totalEarned = referralsFormatted
      .filter((r) => r.rewardStatus === 'COMPLETED')
      .reduce((s, r) => s + (r.referrerRewardAmount || 0), 0);

    res.render('user/referrals', {
      layout: 'main',
      user,
      referralUrl,
      referrals: referralsFormatted,
      rewardAmounts: {
        referrer: settings?.referrerReward || 100,
        referred: settings?.referredReward || 50,
      },
      stats: {
        total: referralsFormatted.length,
        released: referralsFormatted.filter(
          (r) => r.rewardStatus === 'COMPLETED'
        ).length,
        pending: referralsFormatted.filter((r) => r.rewardStatus === 'PENDING')
          .length,
        totalEarned,
      },
    });
  } catch (err) {
    console.error('loadReferrals error:', err);
    res.redirect('/user/profile');
  }
};

export const loadEditProfile = async (req, res) => {
  try {
    let user = await userSchema.findById(req.session.user.id).lean();

    if (user.dob) {
      user.dob = new Date(user.dob).toISOString().split('T')[0];
    }

    res.render('user/editProfile', { layout: 'main', user });
  } catch (err) {
    console.log(err);
    res.redirect('/user/userprofile');
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { name, phone, dob, removeAvatar } = req.body || {};

    const user = await userSchema.findById(req.session.user.id);

    const nameRegex = /^[A-Za-z]+(?:\s[A-Za-z]+)*$/;

    if (!nameRegex.test(name.trim())) {
      return res.render('user/editProfile', {
        layout: 'main',
        user,
        message: 'Name must contain only letters and spaces',
      });
    }

    const phoneRegex = /^[0-9]{10}$/;

    if (phone && !phoneRegex.test(phone)) {
      return res.render('user/editProfile', {
        layout: 'main',
        user,
        message: 'Phone number must be 10 digits',
      });
    }

    let birthDate = null;
    const today = new Date();

    if (dob) {
      birthDate = new Date(dob);
      if (isNaN(birthDate.getTime())) {
        return res.render('user/editProfile', {
          layout: 'main',
          user,
          message: 'Invalid Date of Birth',
        });
      }

      if (birthDate >= today) {
        return res.render('user/editProfile', {
          layout: 'main',
          user,
          message: 'Date of Birth must be in the past',
        });
      }

      if (birthDate.getFullYear() === today.getFullYear()) {
        return res.render('user/editProfile', {
          layout: 'main',
          user,
          message: 'Birth year cannot be current year',
        });
      }

      let age = today.getFullYear() - birthDate.getFullYear();
      if (age < 13) {
        return res.render('user/editProfile', {
          layout: 'main',
          user,
          message: 'Age must be at least 13 years',
        });
      }
    }

    let updateData = {
      name: name.trim(),
      phone: phone ? phone.trim() : '',
      dob: dob ? birthDate : null,
    };

    if (removeAvatar === 'true') {
      updateData.avatar = null;
    } else if (req.file) {
      updateData.avatar = req.file.path;
    }

    await userSchema.findByIdAndUpdate(
      req.session.user.id,
      { $set: updateData },
      { returnDocument: 'after' }
    );

    req.session.user.name = name.trim();
    res.redirect('/user/profile');
  } catch (err) {
    console.log(err);
    res.redirect('/user/editProfile');
  }
};

export const changeEmail = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.json({ success: false, message: 'Email required' });
    }

    const existing = await userSchema.findOne({ email });

    if (existing) {
      return res.json({ success: false, message: 'Email already exists' });
    }

    req.session.changeEmail = email;

    await generateAndSaveOtp({ email, purpose: 'change_email' });

    await new Promise((resolve) => req.session.save(resolve));

    return res.json({ success: true });
  } catch (err) {
    console.log('changeEmail error:', err);
    return res.json({
      success: false,
      message: 'Something went wrong: ' + err.message,
    });
  }
};

export const verifyChangeEmail = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!req.session.changeEmail) {
      return res.json({
        success: false,
        message: 'Session expired. Please request a new OTP.',
      });
    }

    const result = await verifyOtpFromDb({
      email: req.session.changeEmail,
      otp_code: otp,
      purpose: 'change_email',
    });

    if (!result.success) {
      return res.json({ success: false, message: 'Invalid or expired OTP' });
    }

    const newEmail = req.session.changeEmail;
    await userSchema.findByIdAndUpdate(req.session.user.id, {
      email: newEmail,
    });
    req.session.changeEmail = null;
    // Keep session user in sync
    if (req.session.user) req.session.user.email = newEmail;
    return res.json({ success: true });
  } catch (err) {
    console.log('verifyChangeEmail error:', err);
    return res.json({
      success: false,
      message: 'Something went wrong: ' + err.message,
    });
  }
};

export const resendChangeEmailOtp = async (req, res) => {
  try {
    if (!req.session.changeEmail) {
      return res.json({ success: false, message: 'Session expired' });
    }

    await generateAndSaveOtp({
      email: req.session.changeEmail,
      purpose: 'change_email',
    });

    return res.json({ success: true });
  } catch (err) {
    console.log(err);
    return res.json({ success: false });
  }
};

export const deleteAccount = async (req, res) => {
  try {
    console.log('BODY:', req.body);

    const { confirmText } = req.body;

    if (confirmText !== 'DELETE') {
      return res.redirect('/user/profile');
    }

    const userId = req.session.user.id;

    const user = await userSchema.findById(userId);

    if (user?.avatar) {
      const publicId = user.avatar.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy('tymora/users/' + publicId);
    }
    await userSchema.findByIdAndDelete(userId);

    req.session.user = null;
    res.redirect('/user/home?message=Account deleted successfully');
  } catch (err) {
    console.log(err);
    res.redirect('/user/profile');
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const user = await userSchema.findById(req.session.user.id);

    if (!user.password) {
      if (!newPassword || !confirmPassword) {
        return res.json({ success: false, message: 'All fields required' });
      }

      const passwordPattern =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

      if (!passwordPattern.test(newPassword)) {
        return res.json({ success: false, message: 'Weak password' });
      }

      if (newPassword !== confirmPassword) {
        return res.json({ success: false, message: 'Passwords do not match' });
      }

      const hashed = await bcrypt.hash(newPassword, 10);

      user.password = hashed;
      await user.save();

      req.session.user = {
        id: user._id,
        name: user.name,
      };

      return res.json({ success: true });
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.json({ success: false, message: 'All fields required' });
    }

    const passwordPattern =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

    if (!passwordPattern.test(newPassword)) {
      return res.json({ success: false, message: 'Weak password' });
    }

    if (currentPassword === newPassword) {
      return res.json({
        success: false,
        message: 'New password must be different',
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.json({
        success: false,
        message: 'Current password incorrect',
      });
    }
    if (newPassword !== confirmPassword) {
      return res.json({ success: false, message: 'Passwords do not match' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    user.password = hashed;
    await user.save();

    req.session.user = {
      id: user._id,
      name: user.name,
    };

    return res.json({ success: true });
  } catch (err) {
    console.log(err);
    return res.json({ success: false, message: 'Something went wrong' });
  }
};

export const loadAddressPage = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const addresses = await addressModel.find({ userId });
    res.render('user/myAddress', {
      layout: 'main',
      addresses,
      fromCheckout: req.query.from === 'checkout',
    });
  } catch (err) {
    console.log(err);
    res.redirect('/user/profile');
  }
};

export const addAddress = async (req, res) => {
  try {
    console.log('BODY:', req.body);

    const userId = req.session.user.id;

    const { type, fullName, street, city, state, pincode, phone, isDefault } =
      req.body;

    if (
      !type ||
      !fullName ||
      !street ||
      !city ||
      !state ||
      !pincode ||
      !phone
    ) {
      return res.json({ success: false, message: 'All fields required' });
    }

    if (!/^[0-9]{10}$/.test(phone)) {
      return res.json({ success: false, message: 'Invalid phone number' });
    }

    if (!/^[0-9]{6}$/.test(pincode)) {
      return res.json({ success: false, message: 'Invalid pincode' });
    }

    if (isDefault) {
      await addressModel.updateMany({ userId }, { isDefault: false });
    }

    await addressModel.create({
      userId,
      type,
      fullName,
      street,
      city,
      state,
      pincode,
      phone,
      isDefault,
    });

    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false, message: 'Failed to add address' });
  }
};

export const getAddress = async (req, res) => {
  try {
    const address = await addressModel.findById(req.params.id);
    res.json({ success: true, address });
  } catch (err) {
    res.json({ success: false });
  }
};

export const updateAddress = async (req, res) => {
  try {
    const { fullName, phone, street, city, state, pincode, type, isDefault } =
      req.body;

    if (isDefault) {
      await addressModel.updateMany(
        { userId: req.session.user.id },
        { isDefault: false }
      );
    }

    await addressModel.findByIdAndUpdate(req.params.id, {
      fullName,
      phone,
      street,
      city,
      state,
      pincode,
      type,
      isDefault,
    });

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
};

export const setDefaultAddress = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const addressId = req.params.id;

    await addressModel.updateMany({ userId }, { isDefault: false });

    await addressModel.findByIdAndUpdate(addressId, { isDefault: true });

    res.redirect('/user/address');
  } catch (err) {
    console.log(err);
    res.redirect('/user/address');
  }
};

export const deleteAddress = async (req, res) => {
  try {
    await addressModel.findByIdAndDelete(req.params.id);

    res.redirect('/user/address');
  } catch (err) {
    console.log(err);
    res.redirect('/user/address');
  }
};

// categorys and products

export const loadCollectionPage = async (req, res) => {
  try {
    const { collectionId } = req.params;

    // Fetch the category to ensure it exists and get its details
    const category = await Category.findOne({
      _id: collectionId,
      is_visible: true,
      deleted_at: null,
    }).lean();

    if (!category) {
      return res.redirect('/user/shop');
    }

    const {
      q = '',
      brand = '',
      style = '',
      avail = '',
      sort = '',
      priceMin = '',
      priceMax = '',
      page = '1',
    } = req.query;

    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const PER_PAGE = 8;

    const mongoFilter = {
      status: 'active',
      deleted_at: null,
      category: category._id,
    };

    if (avail === 'instock') mongoFilter.stock = { $gt: 0 };
    if (avail === 'outofstock') mongoFilter.stock = { $lte: 0 };
    if (avail === 'sale') mongoFilter.discount = { $gt: 0 };
    if (avail === 'new') mongoFilter.featured = true;

    if (priceMin !== '' || priceMax !== '') {
      mongoFilter.price = {};
      if (priceMin !== '') mongoFilter.price.$gte = parseFloat(priceMin);
      if (priceMax !== '') mongoFilter.price.$lte = parseFloat(priceMax);
    }

    const sortMap = {
      'price-asc': { price: 1 },
      'price-desc': { price: -1 },
      az: { name: 1 },
      za: { name: -1 },
      newest: { createdAt: -1 },
    };
    const mongoSort = sortMap[sort] || { createdAt: -1 };

    let dbProducts = await Product.find(mongoFilter)
      .populate('brand', 'name')
      .sort(mongoSort)
      .lean();

    if (brand.trim()) {
      dbProducts = dbProducts.filter(
        (p) =>
          (p.brand?.name || '').toLowerCase() === brand.trim().toLowerCase()
      );
    }

    if (style.trim()) {
      dbProducts = dbProducts.filter(
        (p) => (p.gender || '').toLowerCase() === style.trim().toLowerCase()
      );
    }

    if (q.trim()) {
      const qLower = q.trim().toLowerCase();
      dbProducts = dbProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(qLower) ||
          (p.brand?.name || '').toLowerCase().includes(qLower)
      );
    }

    if (sort === 'rating') {
      dbProducts.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    }

    const productIds = dbProducts.map((p) => p._id);

    const activeVariants = await Variant.find({
      product: { $in: productIds },
      status: 'active',
      deleted_at: null,
    }).lean();

    const variantsByProduct = {};
    activeVariants.forEach((v) => {
      const pid = v.product.toString();
      if (!variantsByProduct[pid]) variantsByProduct[pid] = [];
      variantsByProduct[pid].push(v);
    });

    dbProducts = dbProducts.filter(
      (p) => (variantsByProduct[p._id.toString()] || []).length > 0
    );

    const DEFAULT_BADGES = [
      'CURATED',
      'PREMIUM',
      'SIGNATURE',
      'CLASSIC',
      'LUXURY PICK',
    ];
    function getPrimaryBadge(p, displayVariant) {
      const stock = displayVariant?.stock ?? 0;
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

    const shaped = dbProducts.map((p) => {
      const variants = variantsByProduct[p._id.toString()] || [];
      const displayVariant = variants.find((v) => v.isDefault) || variants[0];
      const basePrice = displayVariant?.price ?? p.price;

      return {
        id: p._id.toString(),
        name: p.name,
        brand: p.brand?.name || 'Unknown',
        price:
          displayVariant?.salePrice ??
          displayVariant?.price ??
          p.salePrice ??
          p.price ??
          0,
        oldPrice:
          (p.discountPercentage ?? p.discount) > 0
            ? (displayVariant?.originalPrice ?? p.originalPrice ?? null)
            : null,
        discountPct: p.discountPercentage ?? p.discount ?? 0,
        rating: p.rating ?? 4.5,
        reviews: p.reviews ?? 0,
        ...getPrimaryBadge(p, displayVariant),
        cat: category.name.toLowerCase(),
        style: (p.gender || '').toLowerCase(),
        avail: displayVariant?.stock > 0 ? 'instock' : 'outofstock',
        stock: displayVariant?.stock ?? 0,
        variantId: displayVariant?._id.toString() || '',
        img:
          displayVariant?.images?.[0] ||
          p.images?.[0] ||
          'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=400&q=80',
        wished: false,
      };
    });

    if (req.session.user) {
      const [wl, cart] = await Promise.all([
        Wishlist.findOne({ userId: req.session.user.id }).lean(),
        Cart.findOne({ userId: req.session.user.id }).lean(),
      ]);

      if (wl && wl.products.length) {
        const wishedSet = new Set(
          wl.products.map((p) => p.productId.toString())
        );
        shaped.forEach((p) => {
          p.wished = wishedSet.has(p.id);
        });
      }

      if (cart && cart.items.length) {
        const cartVariantSet = new Set(
          cart.items.map((i) => i.variantId.toString())
        );
        shaped.forEach((p) => {
          p.inCart = cartVariantSet.has(p.variantId);
        });
      }
    }

    const totalProducts = shaped.length;
    const totalPages = Math.ceil(totalProducts / PER_PAGE) || 1;
    const safePage = Math.min(currentPage, totalPages);
    const startIdx = (safePage - 1) * PER_PAGE;
    const pageProducts = shaped.slice(startIdx, startIdx + PER_PAGE);

    function buildPageRange(curr, total) {
      const range = [];
      const delta = 1;
      for (let i = 1; i <= total; i++) {
        if (
          i === 1 ||
          i === total ||
          (i >= curr - delta && i <= curr + delta)
        ) {
          range.push({ num: i, active: i === curr, dots: false });
        } else if (range[range.length - 1] && !range[range.length - 1].dots) {
          range.push({ dots: true });
        }
      }
      return range;
    }
    const paginationPages = buildPageRange(safePage, totalPages);

    const unique = (arr) => [...new Set(arr.filter(Boolean))];

    const allBrands = unique(shaped.map((p) => p.brand))
      .sort()
      .map((v) => ({
        value: v.toLowerCase(),
        label: v,
        selected: v.toLowerCase() === brand.toLowerCase(),
      }));

    const allStyles = unique(shaped.map((p) => p.style))
      .filter((v) => v && v.trim())
      .sort()
      .map((v) => ({
        value: v,
        label: v.charAt(0).toUpperCase() + v.slice(1),
        selected: v === style.toLowerCase(),
      }));

    const activeTags = [];
    if (q) activeTags.push({ label: `"${q}"`, key: 'q' });
    if (brand) activeTags.push({ label: brand, key: 'brand' });
    if (style) activeTags.push({ label: style, key: 'style' });
    if (avail) activeTags.push({ label: avail, key: 'avail' });
    if (priceMin || priceMax)
      activeTags.push({
        label: `₹${priceMin || 0} – ₹${priceMax || '∞'}`,
        key: 'price',
      });

    res.render('user/collection', {
      layout: 'main',
      user: req.session.user || null,
      category,
      searchPlaceholder: 'Search within ' + category.name + '...',
      totalProducts,
      shownCount: pageProducts.length,
      startCount: totalProducts ? startIdx + 1 : 0,

      filters: { q, brand, style, avail, priceMin, priceMax, sort },

      sortOptions: [
        {
          value: 'price-asc',
          label: 'Price: Low to High',
          selected: sort === 'price-asc',
        },
        {
          value: 'price-desc',
          label: 'Price: High to Low',
          selected: sort === 'price-desc',
        },
        { value: 'newest', label: 'New Arrivals', selected: sort === 'newest' },
        {
          value: 'rating',
          label: 'Customer Rating',
          selected: sort === 'rating',
        },
        { value: 'az', label: 'Name: A - Z', selected: sort === 'az' },
        { value: 'za', label: 'Name: Z - A', selected: sort === 'za' },
      ],

      filterOptions: { brands: allBrands, styles: allStyles },

      products: pageProducts,
      shopData: { products: shaped },

      activeTags,

      pagination: {
        pages: paginationPages,
        hasPrev: safePage > 1,
        hasNext: safePage < totalPages,
        prevPage: safePage - 1,
        nextPage: safePage + 1,
      },
    });
  } catch (err) {
    console.log(err);
    res.redirect('/user/shop');
  }
};

export const loadshop = async (req, res) => {
  try {
    const {
      q = '',
      cat = '',
      brand = '',
      style = '',
      avail = '',
      sort = '',
      priceMin = '',
      priceMax = '',
      page = '1',
      msg = '',
    } = req.query;

    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const PER_PAGE = 8;

    const mongoFilter = {
      status: 'active',
      deleted_at: null,
    };

    if (avail === 'instock') mongoFilter.stock = { $gt: 0 };
    if (avail === 'outofstock') mongoFilter.stock = { $lte: 0 };
    if (avail === 'sale') mongoFilter.discount = { $gt: 0 };
    if (avail === 'new') mongoFilter.featured = true;

    if (priceMin !== '' || priceMax !== '') {
      mongoFilter.price = {};
      if (priceMin !== '') mongoFilter.price.$gte = parseFloat(priceMin);
      if (priceMax !== '') mongoFilter.price.$lte = parseFloat(priceMax);
    }

    const sortMap = {
      'price-asc': { price: 1 },
      'price-desc': { price: -1 },
      az: { name: 1 },
      za: { name: -1 },
      newest: { createdAt: -1 },
    };
    const mongoSort = sortMap[sort] || { createdAt: -1 };

    let dbProducts = await Product.find(mongoFilter)
      .populate('category', 'name is_visible deleted_at')
      .populate('brand', 'name')
      .sort(mongoSort)
      .lean();

    dbProducts = dbProducts.filter(
      (p) =>
        p.category &&
        p.category.is_visible !== false &&
        p.category.deleted_at == null
    );

    if (brand.trim()) {
      dbProducts = dbProducts.filter(
        (p) =>
          (p.brand?.name || '').toLowerCase() === brand.trim().toLowerCase()
      );
    }

    if (cat.trim()) {
      dbProducts = dbProducts.filter(
        (p) =>
          (p.category?.name || '').toLowerCase() === cat.trim().toLowerCase()
      );
    }

    if (style.trim()) {
      dbProducts = dbProducts.filter(
        (p) => (p.gender || '').toLowerCase() === style.trim().toLowerCase()
      );
    }

    if (q.trim()) {
      const qLower = q.trim().toLowerCase();
      dbProducts = dbProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(qLower) ||
          (p.brand?.name || '').toLowerCase().includes(qLower)
      );
    }

    if (sort === 'rating') {
      dbProducts.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    }

    const productIds = dbProducts.map((p) => p._id);

    const activeVariants = await Variant.find({
      product: { $in: productIds },
      status: 'active',
      deleted_at: null,
    }).lean();

    const variantsByProduct = {};
    activeVariants.forEach((v) => {
      const pid = v.product.toString();
      if (!variantsByProduct[pid]) variantsByProduct[pid] = [];
      variantsByProduct[pid].push(v);
    });

    dbProducts = dbProducts.filter(
      (p) => (variantsByProduct[p._id.toString()] || []).length > 0
    );

    const shaped = dbProducts.map((p) => {
      const variants = variantsByProduct[p._id.toString()] || [];

      const displayVariant = variants.find((v) => v.isDefault) || variants[0];

      const basePrice = displayVariant?.price ?? p.price;
      const discountedPrice =
        p.discount > 0
          ? Math.round(basePrice - (basePrice * p.discount) / 100)
          : basePrice;

      return {
        id: p._id.toString(),
        name: p.name,
        brand: p.brand?.name || 'Unknown',
        price:
          displayVariant?.salePrice ??
          displayVariant?.price ??
          p.salePrice ??
          p.price ??
          0,
        oldPrice:
          (p.discountPercentage ?? p.discount) > 0
            ? (displayVariant?.originalPrice ?? p.originalPrice ?? null)
            : null,
        discountPct: p.discountPercentage ?? p.discount ?? 0,
        rating: p.rating ?? 4.5,
        reviews: p.reviews ?? 0,
        ...getPrimaryBadge(p, displayVariant),
        cat: (p.category?.name || 'other').toLowerCase(),
        style: (p.gender || '').toLowerCase(),
        avail: displayVariant?.stock > 0 ? 'instock' : 'outofstock',
        stock: displayVariant?.stock ?? 0,
        variantId: displayVariant?._id.toString() || '',
        img:
          displayVariant?.images?.[0] ||
          p.images?.[0] ||
          'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=400&q=80',
        wished: false,
      };
    });

    if (req.session.user) {
      const [wl, cart] = await Promise.all([
        Wishlist.findOne({ userId: req.session.user.id }).lean(),
        Cart.findOne({ userId: req.session.user.id }).lean(),
      ]);

      if (wl && wl.products.length) {
        const wishedSet = new Set(
          wl.products.map((p) => p.productId.toString())
        );
        shaped.forEach((p) => {
          p.wished = wishedSet.has(p.id);
        });
      }

      if (cart && cart.items.length) {
        const cartVariantSet = new Set(
          cart.items.map((i) => i.variantId.toString())
        );
        shaped.forEach((p) => {
          p.inCart = cartVariantSet.has(p.variantId);
        });
      }
    }

    const totalProducts = shaped.length;
    const totalPages = Math.ceil(totalProducts / PER_PAGE) || 1;
    const safePage = Math.min(currentPage, totalPages);
    const startIdx = (safePage - 1) * PER_PAGE;
    const pageProducts = shaped.slice(startIdx, startIdx + PER_PAGE);
    const paginationPages = buildPageRange(safePage, totalPages);

    const unique = (arr) => [...new Set(arr.filter(Boolean))];

    const allCategories = unique(shaped.map((p) => p.cat))
      .sort()
      .map((v) => ({
        value: v,
        label: v.charAt(0).toUpperCase() + v.slice(1),
        selected: v === cat.toLowerCase(),
      }));

    const allBrands = unique(shaped.map((p) => p.brand))
      .sort()
      .map((v) => ({
        value: v.toLowerCase(),
        label: v,
        selected: v.toLowerCase() === brand.toLowerCase(),
      }));

    const allStyles = unique(shaped.map((p) => p.style))
      .filter((v) => v && v.trim())
      .sort()
      .map((v) => ({
        value: v,
        label: v.charAt(0).toUpperCase() + v.slice(1),
        selected: v === style.toLowerCase(),
      }));

    const featured = [...shaped]
      .filter((p) => p.badge !== null)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 8);

    const activeTags = [];
    if (q) activeTags.push({ label: `"${q}"`, key: 'q' });
    if (cat)
      activeTags.push({
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
        key: 'cat',
      });
    if (brand) activeTags.push({ label: brand, key: 'brand' });
    if (style) activeTags.push({ label: style, key: 'style' });
    if (avail) activeTags.push({ label: avail, key: 'avail' });
    if (priceMin || priceMax)
      activeTags.push({
        label: `₹${priceMin || 0} – ₹${priceMax || '∞'}`,
        key: 'price',
      });

    res.render('user/allProducts', {
      layout: 'main',
      user: req.session.user || null,

      totalProducts,
      shownCount: pageProducts.length,
      startCount: totalProducts ? startIdx + 1 : 0,

      filters: { q, cat, brand, style, avail, priceMin, priceMax, sort },

      sortOptions: [
        {
          value: 'price-asc',
          label: 'Price: Low to High',
          selected: sort === 'price-asc',
        },
        {
          value: 'price-desc',
          label: 'Price: High to Low',
          selected: sort === 'price-desc',
        },
        { value: 'az', label: 'Name: A – Z', selected: sort === 'az' },
        { value: 'za', label: 'Name: Z – A', selected: sort === 'za' },
        { value: 'rating', label: 'Top Rated', selected: sort === 'rating' },
        { value: 'newest', label: 'Newest', selected: sort === 'newest' },
      ],

      filterOptions: {
        categories: allCategories,
        brands: allBrands,
        styles: allStyles,
        availability: [
          {
            value: 'instock',
            label: 'In Stock',
            selected: avail === 'instock',
          },
          {
            value: 'outofstock',
            label: 'Out of Stock',
            selected: avail === 'outofstock',
          },
          { value: 'sale', label: 'On Sale', selected: avail === 'sale' },
          { value: 'new', label: 'Featured', selected: avail === 'new' },
        ],
      },

      pagination: {
        current: safePage,
        total: totalPages,
        pages: paginationPages,
        hasPrev: safePage > 1,
        hasNext: safePage < totalPages,
        prevPage: safePage - 1,
        nextPage: safePage + 1,
      },

      activeTags,
      products: pageProducts,
      featured,
      searchPlaceholder: 'Search watches…',
      shopData: { featured },
      noticeMsg:
        msg === 'unavailable' ? 'This product is currently unavailable.' : null,
    });
  } catch (err) {
    console.error('loadshop error:', err);
    res.render('user/allProducts', {
      layout: 'main',
      user: req.session.user || null,
      totalProducts: 0,
      shownCount: 0,
      startCount: 0,
      filters: {
        q: '',
        cat: '',
        brand: '',
        style: '',
        avail: '',
        priceMin: '',
        priceMax: '',
        sort: '',
      },
      sortOptions: [],
      filterOptions: {
        categories: [],
        brands: [],
        styles: [],
        availability: [],
      },
      pagination: {
        current: 1,
        total: 1,
        pages: [],
        hasPrev: false,
        hasNext: false,
        prevPage: 1,
        nextPage: 1,
      },
      activeTags: [],
      products: [],
      featured: [],
      searchPlaceholder: 'Search watches…',
      shopData: { featured: [] },
    });
  }
};

const DEFAULT_BADGES = [
  'CURATED',
  'PREMIUM',
  'SIGNATURE',
  'CLASSIC',
  'LUXURY PICK',
];

function getDefaultBadgeLabel(product) {
  const seed =
    parseInt((product._id || product.id || '0').toString().slice(-2), 16) || 0;
  return DEFAULT_BADGES[seed % DEFAULT_BADGES.length];
}

function getPrimaryBadge(product, variant) {
  const stock = variant?.stock ?? product.stock ?? 999;
  const hoursSinceCreated = product.createdAt
    ? (Date.now() - new Date(product.createdAt).getTime()) / 3600000
    : 9999;

  if (product.dealOfTheDay)
    return { badge: 'deal', badgeLabel: 'DEAL OF THE DAY' };
  if (product.featured) return { badge: 'featured', badgeLabel: 'BEST PICK' };
  if (stock > 0 && stock <= 5)
    return { badge: 'low-stock', badgeLabel: `ONLY ${stock} LEFT` };
  if (hoursSinceCreated <= 24) return { badge: 'new', badgeLabel: 'NEW' };
  return { badge: 'default', badgeLabel: getDefaultBadgeLabel(product) };
}

function getProductBadge(product, variant) {
  return getPrimaryBadge(product, variant).badge;
}

function getProductBadgeLabel(product, variant) {
  return getPrimaryBadge(product, variant).badgeLabel;
}

function buildPageRange(cur, total) {
  if (total <= 1) return [];
  const range = [];
  const push = (n) => range.push({ num: n, active: n === cur, dots: false });
  const dots = () => range.push({ num: null, active: false, dots: true });

  if (total <= 7) {
    for (let i = 1; i <= total; i++) push(i);
    return range;
  }

  push(1);
  if (cur <= 4) {
    push(2);
    push(3);
    push(4);
    push(5);
    dots();
    push(total);
  } else if (cur >= total - 3) {
    dots();
    push(total - 4);
    push(total - 3);
    push(total - 2);
    push(total - 1);
    push(total);
  } else {
    dots();
    push(cur - 1);
    push(cur);
    push(cur + 1);
    dots();
    push(total);
  }
  return range;
}

export const loadProductDetail = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findOne({
      _id: id,
      status: 'active',
      deleted_at: null,
    })
      .populate('brand', 'name')
      .populate('category', 'name is_visible deleted_at')
      .lean();

    if (
      !product ||
      !product.category ||
      product.category.is_visible === false ||
      product.category.deleted_at
    ) {
      return res.redirect('/user/shop?msg=unavailable');
    }

    const variants = await Variant.find({
      product: id,
      status: 'active',
      deleted_at: null,
    }).lean();

    if (!variants.length) return res.redirect('/user/shop?msg=unavailable');

    const displayVariant = variants.find((v) => v.isDefault) || variants[0];
    const finalPrice = displayVariant.salePrice ?? displayVariant.price ?? 0;
    const oldPrice =
      displayVariant.originalPrice > displayVariant.salePrice
        ? displayVariant.originalPrice
        : null;
    const discountPct = displayVariant.discountPercentage ?? 0;

    let wished = false;
    let cartItems = [];
    let wishedSet = new Set();
    let cartVariantSet = new Set();

    if (req.session.user) {
      const [wl, cart] = await Promise.all([
        Wishlist.findOne({ userId: req.session.user.id }).lean(),
        Cart.findOne({ userId: req.session.user.id }).lean(),
      ]);

      if (wl?.products?.length) {
        wishedSet = new Set(wl.products.map((p) => p.productId.toString()));
        wished = wishedSet.has(id);
      }

      if (cart?.items?.length) {
        cartItems = cart.items.map((i) => i.variantId.toString());
        cartVariantSet = new Set(cartItems);
      }
    }

    const variantData = variants.map((v) => ({
      id: v._id.toString(),
      name: v.name,
      sku: v.sku || '',
      strapColor: v.strapColor || '',
      dialColor: v.dialColor || '',
      caseColor: v.caseColor || '',
      strapMaterial: v.strapMaterial || '',
      caseMaterial: v.caseMaterial || '',
      size: v.size || '',
      originalPrice: v.originalPrice ?? 0,
      salePrice: v.salePrice ?? 0,
      discountPct: v.discountPercentage ?? 0,
      stock: v.stock ?? 0,
      images: v.images || [],
      isDefault: !!v.isDefault,
      inCart: cartItems.includes(v._id.toString()),
      avail: v.stock > 0 ? 'instock' : 'outofstock',
    }));

    const relatedRaw = await Product.find({
      _id: { $ne: id },
      category: product.category._id,
      status: 'active',
      deleted_at: null,
    })
      .populate('brand', 'name')
      .limit(8)
      .lean();

    const relatedVariants = await Variant.find({
      product: { $in: relatedRaw.map((p) => p._id) },
      status: 'active',
      deleted_at: null,
    }).lean();

    const relVarMap = {};
    relatedVariants.forEach((v) => {
      const pid = v.product.toString();
      if (!relVarMap[pid] || v.isDefault) relVarMap[pid] = v;
    });

    const relatedProducts = relatedRaw
      .filter((p) => relVarMap[p._id.toString()])
      .slice(0, 4)
      .map((p) => {
        const rv = relVarMap[p._id.toString()];
        const pid = p._id.toString();
        const vid = rv._id.toString();
        return {
          id: pid,
          name: p.name,
          brand: p.brand?.name || 'TYMORA',
          price: rv.salePrice ?? rv.price ?? 0,
          oldPrice: rv.originalPrice > rv.salePrice ? rv.originalPrice : null,
          discountPct: rv.discountPercentage ?? 0,
          rating: p.rating ?? 4.5,
          reviews: p.reviews ?? 0,
          badge: getProductBadge(p, rv),
          badgeLabel: getProductBadgeLabel(p, rv),
          avail: rv.stock > 0 ? 'instock' : 'outofstock',
          img: rv.images?.[0] || p.images?.[0] || '',
          variantId: vid,
          wished: wishedSet.has(pid),
          inCart: cartVariantSet.has(vid),
        };
      });

    const productReviews = await Review.find({ productId: id, isVisible: true })
      .populate('userId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    let avgRating = 0;
    let reviewCount = productReviews.length;
    let ratingBreakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

    if (reviewCount > 0) {
      const sum = productReviews.reduce((acc, r) => {
        ratingBreakdown[r.rating] = (ratingBreakdown[r.rating] || 0) + 1;
        return acc + r.rating;
      }, 0);
      avgRating = (sum / reviewCount).toFixed(1);
    }

    const formattedReviews = productReviews.map((r) => ({
      ...r,
      userName: r.userId?.name || 'Verified Buyer',
      dateFormatted: new Date(r.createdAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    }));

    // Fetch one active, globally applicable coupon to showcase on the product page
    const now = new Date();
    const showcaseCoupon = await Coupon.findOne({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      offerType: 'global',
      $or: [
        { usageLimit: 0 },
        { $expr: { $lt: ['$usedCount', '$usageLimit'] } },
      ],
    })
      .sort({ discountValue: -1 })
      .lean();

    const couponData = showcaseCoupon
      ? {
        code: showcaseCoupon.code,
        discountType: showcaseCoupon.discountType,
        discountValue: showcaseCoupon.discountValue,
        label:
          showcaseCoupon.discountType === 'percentage'
            ? `Use code for extra ${showcaseCoupon.discountValue}% off`
            : `Use code for ₹${showcaseCoupon.discountValue} off`,
      }
      : null;

    res.render('user/productDetail', {
      layout: 'main',
      user: req.session.user || null,
      product: {
        id: product._id.toString(),
        name: product.name,
        brand: product.brand?.name || 'TYMORA',
        description: product.description || '',
        gender: product.gender || '',
        category: product.category?.name || '',
        tags: product.tags || [],
        featured: product.featured || false,
        dealOfTheDay: product.dealOfTheDay || false,
        rating: avgRating,
        ratingRounded: Math.round(Number(avgRating)),
        reviewCount: reviewCount,
        price: finalPrice,
        oldPrice,
        discountPct,
        sku:
          displayVariant.sku ||
          displayVariant._id.toString().slice(-8).toUpperCase(),
        avail: displayVariant.stock > 0 ? 'instock' : 'outofstock',
        stock: displayVariant.stock ?? 0,
        images: displayVariant.images?.length
          ? displayVariant.images
          : product.images || [],
        wished,
        variantId: displayVariant._id.toString(),
        inCart: cartItems.includes(displayVariant._id.toString()),
        reviews: formattedReviews,
        ratingBreakdown,
      },
      coupon: couponData,
      variantData: JSON.stringify(variantData),
      relatedProducts,
    });
  } catch (err) {
    console.error('loadProductDetail error:', err);
    res.redirect('/user/shop');
  }
};

// WISHLIST MANAGEMENT

export const loadWishlist = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const wishlist = await Wishlist.findOne({ userId }).lean();

    if (!wishlist || !wishlist.products.length) {
      return res.render('user/wishlist', {
        layout: 'main',
        user: req.session.user,
        products: [],
      });
    }

    const productIds = wishlist.products.map((p) => p.productId);

    const dbProducts = await Product.find({
      _id: { $in: productIds },
      status: 'active',
      deleted_at: null,
    })
      .populate('brand', 'name')
      .populate('category', 'name is_visible deleted_at')
      .lean();

    const activeIds = dbProducts.map((p) => p._id.toString());
    const variantDocs = await Variant.find({
      product: { $in: activeIds },
      status: 'active',
      deleted_at: null,
    }).lean();

    const variantMap = {};
    variantDocs.forEach((v) => {
      const pid = v.product.toString();
      if (!variantMap[pid] || v.isDefault) variantMap[pid] = v;
    });

    let cartVariantSet = new Set();
    if (req.session.user?.id) {
      const cart = await Cart.findOne({ userId: req.session.user.id }).lean();
      if (cart?.items?.length) {
        cartVariantSet = new Set(cart.items.map((i) => i.variantId.toString()));
      }
    }

    const products = wishlist.products
      .map(({ productId }) => {
        const pid = productId.toString();
        const p = dbProducts.find((d) => d._id.toString() === pid);
        if (!p) return null;
        if (
          !p.category ||
          p.category.is_visible === false ||
          p.category.deleted_at
        )
          return null;
        const display = variantMap[pid];
        if (!display) return null;
        const bp = display.price ?? p.price;
        const fp =
          p.discount > 0 ? Math.round(bp - (bp * p.discount) / 100) : bp;
        return {
          id: pid,
          name: p.name,
          brand: p.brand?.name || 'TYMORA',
          price:
            display.salePrice ?? display.price ?? p.salePrice ?? p.price ?? 0,
          oldPrice:
            (p.discountPercentage ?? p.discount) > 0
              ? (display.originalPrice ?? p.originalPrice ?? null)
              : null,
          discountPct: p.discountPercentage ?? p.discount ?? 0,
          rating: p.rating ?? 4.5,
          reviews: p.reviews ?? 0,
          ...getPrimaryBadge(p, display),
          avail: display.stock > 0 ? 'instock' : 'outofstock',
          img: display.images?.[0] || p.images?.[0] || '',
          variantId: display._id.toString(),
          inCart: cartVariantSet.has(display._id.toString()),
        };
      })
      .filter(Boolean);

    res.render('user/wishlist', {
      layout: 'main',
      user: req.session.user,
      products,
    });
  } catch (err) {
    console.error('loadWishlist error:', err);
    res.render('user/wishlist', {
      layout: 'main',
      user: req.session.user,
      products: [],
    });
  }
};

export const toggleWishlist = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { productId } = req.body;

    if (!userId) return res.json({ success: false, redirect: '/user/login' });
    if (!productId)
      return res.json({ success: false, message: 'Missing productId' });

    // Check if product is already in wishlist
    const existing = await Wishlist.findOne({
      userId,
      'products.productId': productId,
    });

    if (existing) {
      await Wishlist.findOneAndUpdate(
        { userId },
        { $pull: { products: { productId } } },
        { returnDocument: 'after' }
      );
      return res.json({ success: true, status: 'removed' });
    } else {
      await Wishlist.findOneAndUpdate(
        { userId, 'products.productId': { $ne: productId } },
        { $push: { products: { productId } } },
        { upsert: true, returnDocument: 'after' }
      );
      return res.json({ success: true, status: 'added' });
    }
  } catch (err) {
    console.error('toggleWishlist error:', err);
    return res.json({ success: false, message: 'Something went wrong' });
  }
};

export const getWishlistIds = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) return res.json({ ids: [] });

    const wishlist = await Wishlist.findOne({ userId }).lean();
    if (!wishlist || !wishlist.products.length) return res.json({ ids: [] });

    const rawIds = wishlist.products.map((p) => p.productId);

    // Only count products that are active, not deleted, and whose category is visible
    const activeProducts = await Product.find({
      _id: { $in: rawIds },
      status: 'active',
      deleted_at: null,
    })
      .populate('category', 'is_visible deleted_at')
      .select('_id category')
      .lean();

    // Filter out products whose category is hidden or trashed
    const visibleProductIds = activeProducts
      .filter((p) => {
        if (!p.category) return false;
        if (p.category.is_visible === false) return false;
        if (p.category.deleted_at) return false;
        return true;
      })
      .map((p) => p._id.toString());

    // Also ensure at least one active variant exists for each product
    const variantProductIds = await Variant.distinct('product', {
      product: { $in: visibleProductIds },
      status: 'active',
      deleted_at: null,
    });

    const finalIds = variantProductIds.map((id) => id.toString());
    return res.json({ ids: finalIds });
  } catch {
    return res.json({ ids: [] });
  }
};

export const addAllToCart = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) return res.json({ success: false, redirect: '/user/login' });

    const wishlist = await Wishlist.findOne({ userId }).lean();
    if (!wishlist || !wishlist.products.length) {
      return res.json({ success: false, message: 'Wishlist is empty' });
    }

    const productIds = wishlist.products.map((p) => p.productId);
    const variants = await Variant.find({
      product: { $in: productIds },
      status: 'active',
      deleted_at: null,
      stock: { $gt: 0 },
    }).lean();

    const variantMap = {};
    variants.forEach((v) => {
      const pid = v.product.toString();
      if (!variantMap[pid] || v.isDefault) variantMap[pid] = v;
    });

    let cart = await Cart.findOne({ userId });
    if (!cart) cart = new Cart({ userId, items: [] });

    let added = 0;
    const addedVariants = [];

    for (const { productId } of wishlist.products) {
      const pid = productId.toString();
      const variant = variantMap[pid];
      if (!variant) continue;

      const alreadyInCart = cart.items.find(
        (i) =>
          i.productId.toString() === pid &&
          i.variantId.toString() === variant._id.toString()
      );

      if (alreadyInCart) continue;

      cart.items.push({
        productId,
        variantId: variant._id,
        quantity: 1,
        price: variant.salePrice ?? variant.price,
      });
      added++;
      addedVariants.push(variant._id.toString());
    }

    await cart.save();
    const cartCount = cart.items.reduce((s, i) => s + i.quantity, 0);
    return res.json({ success: true, added, addedVariants, cartCount });
  } catch (err) {
    console.error('addAllToCart error:', err);
    return res.json({ success: false, message: 'Something went wrong' });
  }
};

const CART_MAX_QTY = 7;

async function buildCartView(cart) {
  if (!cart || !cart.items.length) {
    return { isEmpty: true, cartItems: [], subtotal: 0 };
  }

  await cart.populate([
    {
      path: 'items.productId',
      select:
        'name images status deleted_at discount discountPercentage originalPrice',
      populate: { path: 'brand', select: 'name' },
    },
    {
      path: 'items.variantId',
      select:
        'salePrice price originalPrice discountPercentage stock images status deleted_at',
    },
  ]);

  const cartItems = [];
  let subtotal = 0;
  let cartWasChanged = false;

  for (const item of cart.items) {
    const product = item.productId;
    const variant = item.variantId;

    if (!product || !variant) continue;
    const isInactive =
      product.status !== 'active' ||
      !!product.deleted_at ||
      variant.status !== 'active' ||
      !!variant.deleted_at;
    const isOutOfStock = isInactive ? true : (variant.stock ?? 0) <= 0;

    let qty = item.quantity;
    if (!isOutOfStock) {
      const maxAllowed = Math.min(variant.stock, CART_MAX_QTY);
      if (qty > maxAllowed) {
        item.quantity = Math.max(maxAllowed, 1);
        qty = item.quantity;
        cartWasChanged = true;
      }
    }

    const price = variant.salePrice ?? variant.price ?? item.price;
    const rawOldPrice = variant.originalPrice ?? product.originalPrice ?? null;
    const discountPct =
      variant.discountPercentage ??
      product.discountPercentage ??
      product.discount ??
      0;
    const oldPrice =
      rawOldPrice && rawOldPrice > price
        ? rawOldPrice
        : discountPct > 0
          ? rawOldPrice
          : null;
    const total = price * qty;

    if (!isOutOfStock) subtotal += total;

    cartItems.push({
      id: item._id.toString(),
      productId: product._id.toString(),
      variantId: variant._id.toString(),
      brand: product.brand?.name || 'TYMORA',
      name: product.name,
      img: variant.images?.[0] || product.images?.[0] || '',
      price,
      oldPrice,
      discountPct,
      qty,
      total,
      stock: variant.stock ?? 0,
      isOutOfStock,
      isInactive,
    });
  }

  if (cartWasChanged) {
    cart.items = cart.items.filter((i) => i.quantity >= 1);
    await cart.save();
  }

  const hasOutOfStock = cartItems.some((i) => i.isOutOfStock);
  return {
    isEmpty: cartItems.length === 0,
    cartItems,
    subtotal,
    hasOutOfStock,
  };
}

export const loadCart = async (req, res) => {
  try {
    // Clear any active buyNow session to prevent flow mixing
    if (req.session.buyNow) {
      delete req.session.buyNow;
    }

    const cart = await Cart.findOne({ userId: req.session.user.id });
    const data = await buildCartView(cart);
    res.render('user/cart', {
      layout: 'main',
      user: req.session.user,
      ...data,
    });
  } catch (err) {
    console.error('loadCart error:', err);
    res.render('user/cart', {
      layout: 'main',
      user: req.session.user,
      isEmpty: true,
      cartItems: [],
      subtotal: 0,
    });
  }
};

export const addToCart = async (req, res) => {
  try {
    const { productId, variantId, quantity = 1 } = req.body;
    const userId = req.session.user?.id;

    if (!userId) return res.json({ success: false, redirect: '/user/login' });
    if (!productId || !variantId)
      return res.json({
        success: false,
        message: 'Missing product or variant',
      });

    const variant = await Variant.findOne({
      _id: variantId,
      product: productId,
    });
    const product = await Product.findOne({ _id: productId }).populate(
      'category',
      'is_visible deleted_at'
    );

    if (
      !product ||
      !variant ||
      product.status !== 'active' ||
      !!product.deleted_at ||
      variant.status !== 'active' ||
      !!variant.deleted_at ||
      !product.category ||
      product.category.is_visible === false ||
      product.category.deleted_at
    ) {
      return res.json({
        success: false,
        redirect: '/user/shop?msg=unavailable',
      });
    }

    if (variant.stock <= 0)
      return res.json({
        success: false,
        message: 'This product is out of stock.',
      });

    let cart = await Cart.findOne({ userId });
    if (!cart) cart = new Cart({ userId, items: [] });

    const existing = cart.items.find(
      (i) =>
        i.productId.toString() === productId &&
        i.variantId.toString() === variantId
    );

    const maxAllowed = Math.min(variant.stock, 7);
    if (existing) {
      const newQty = existing.quantity + Number(quantity);
      if (newQty > maxAllowed) {
        return res.json({
          success: false,
          message: `Maximum ${maxAllowed} units allowed`,
        });
      }
      existing.quantity = newQty;
    } else {
      if (Number(quantity) > maxAllowed) {
        return res.json({
          success: false,
          message: `Maximum ${maxAllowed} units allowed`,
        });
      }
      cart.items.push({
        productId,
        variantId,
        quantity: Number(quantity),
        price: variant.price,
      });
    }

    await cart.save();
    const cartCount = cart.items.reduce((s, i) => s + i.quantity, 0);
    return res.json({ success: true, message: 'Added to cart', cartCount });
  } catch (err) {
    console.error('addToCart error:', err);
    return res.json({ success: false, message: 'Something went wrong' });
  }
};

export const updateCartItem = async (req, res) => {
  try {
    const { itemId, quantity } = req.body;
    const userId = req.session.user?.id;
    const qty = Number(quantity);

    if (qty < 1)
      return res.json({ success: false, message: 'Invalid quantity' });

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.json({ success: false, message: 'Cart not found' });

    const item = cart.items.id(itemId);
    if (!item) return res.json({ success: false, message: 'Item not found' });

    const variant = await Variant.findOne({
      _id: item.variantId,
      status: 'active',
      deleted_at: null,
    });
    if (!variant)
      return res.json({
        success: false,
        message: 'Variant no longer available',
      });
    const maxAllowed = Math.min(variant.stock, 7);
    if (qty > maxAllowed) {
      return res.json({
        success: false,
        message: `Maximum ${maxAllowed} units allowed`,
      });
    }

    item.quantity = qty;
    await cart.save();

    const newTotal = (variant.salePrice ?? variant.price) * qty;

    const subtotal = cart.items.reduce((s, i) => {
      if (i._id.toString() === item._id.toString()) {
        return s + (variant.salePrice ?? variant.price) * qty;
      }
      return s + i.price * i.quantity;
    }, 0);
    const cartCount = cart.items.reduce((s, i) => s + i.quantity, 0);

    return res.json({ success: true, newTotal, subtotal, cartCount });
  } catch (err) {
    console.error('updateCartItem error:', err);
    return res.json({ success: false, message: 'Something went wrong' });
  }
};

export const removeCartItem = async (req, res) => {
  try {
    const { itemId } = req.body;
    const userId = req.session.user?.id;

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.json({ success: false, message: 'Cart not found' });

    cart.items = cart.items.filter((i) => i._id.toString() !== itemId);
    await cart.save();

    const subtotal = cart.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const cartCount = cart.items.reduce((s, i) => s + i.quantity, 0);

    return res.json({
      success: true,
      subtotal,
      cartCount,
      isEmpty: cart.items.length === 0,
    });
  } catch (err) {
    console.error('removeCartItem error:', err);
    return res.json({ success: false, message: 'Something went wrong' });
  }
};

export const getCartCount = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) return res.json({ count: 0 });
    const cart = await Cart.findOne({ userId });
    const count = cart ? cart.items.reduce((s, i) => s + i.quantity, 0) : 0;
    return res.json({ count });
  } catch {
    return res.json({ count: 0 });
  }
};

export const checkProductStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findOne({
      _id: id,
      status: 'active',
      deleted_at: null,
    })
      .populate('category', 'is_visible deleted_at')
      .lean();

    if (
      !product ||
      !product.category ||
      product.category.is_visible === false ||
      product.category.deleted_at
    ) {
      return res.json({ active: false });
    }

    // Also check if at least one active variant exists
    const variantExists = await Variant.exists({
      product: id,
      status: 'active',
      deleted_at: null,
    });

    if (!variantExists) {
      return res.json({ active: false });
    }

    return res.json({ active: true });
  } catch (err) {
    console.error('checkProductStatus error:', err);
    return res.json({ active: false });
  }
};

// ORDER MANAGEMENT

export const getUserOrders = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) return res.redirect('/user/login');

    const searchQuery = req.query.search || '';

    let query = {
      userId,
    };
    if (searchQuery) {
      query.$or = [
        { orderId: { $regex: searchQuery, $options: 'i' } },
        { 'products.productName': { $regex: searchQuery, $options: 'i' } },
      ];
    }

    let orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const settings = (await Settings.findOne().lean()) || {
      returnPeriodDays: 7,
    };
    const userReviews = await Review.find({ userId }).lean();
    const reviewedSet = new Set(
      userReviews.map((r) => `${r.orderId}_${r.productId.toString()}`)
    );
    const fmtDate = (d) =>
      new Date(d).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

    orders = orders.map((order) => {
      const mappedProducts = order.products.map((item) => {
        let canCancel = false;
        let canTrack = false;
        let canReturn = false;
        let showReview = false;
        let isReturned = false;

        const st = item.orderStatus;
        if (['Pending', 'Confirmed', 'Packed'].includes(st)) {
          canCancel = true;
        }

        if (
          [
            'Pending',
            'Confirmed',
            'Packed',
            'Shipped',
            'Out for Delivery',
            'Delivered',
          ].includes(st)
        ) {
          canTrack = true;
        }

        if (st === 'Delivered') {
          const key = `${order.orderId}_${item.productId.toString()}`;
          showReview = !reviewedSet.has(key);
          const deliveryLog = (item.trackingTimeline || []).find(
            (t) => t.status === 'Delivered'
          );
          const deliveryDate = deliveryLog
            ? deliveryLog.timestamp
            : order.updatedAt;
          const daysSinceDelivery =
            (new Date() - new Date(deliveryDate)) / (1000 * 60 * 60 * 24);
          const rpd = settings.returnPeriodDays || 7;
          if (daysSinceDelivery <= rpd) {
            canReturn = true;
          }
        }

        if (
          [
            'Return Requested',
            'Return Approved',
            'Pickup Scheduled',
            'Return Picked',
            'Refund Processed',
            'Return Rejected',
            'Returned',
          ].includes(st)
        ) {
          isReturned = true; // For "View Return Tracking"
        }

        const isPaymentFailed = order.paymentStatus === 'Failed';

        // Suppress all actions for failed-payment items
        if (isPaymentFailed) {
          return {
            ...item,
            canCancel: false,
            canTrack: false,
            canReturn: false,
            showReview: false,
            isReturned: false,
          };
        }

        return {
          ...item,
          canCancel,
          canTrack,
          canReturn,
          showReview,
          isReturned,
        };
      });

      // Show invoice if at least one product is delivered or in a return state
      const canDownloadInvoice = mappedProducts.some((p) =>
        [
          'Delivered',
          'Return Requested',
          'Return Approved',
          'Pickup Scheduled',
          'Return Picked',
          'Refund Processed',
          'Return Rejected',
          'Returned',
        ].includes(p.orderStatus)
      );

      let totalCancelledRefunds = 0;
      let totalReturnedRefunds = 0;

      mappedProducts.forEach((item) => {
        if (item.orderStatus === 'Cancelled' && item.refundAmountProcessed) {
          totalCancelledRefunds += item.refundAmountProcessed;
        }
        if (
          ['Returned', 'Refund Processed'].includes(item.orderStatus) &&
          item.refundAmountProcessed
        ) {
          totalReturnedRefunds += item.refundAmountProcessed;
        }
      });

      const finalAmountPaid =
        order.totalAmount - totalCancelledRefunds - totalReturnedRefunds;

      const isPaymentFailed = order.paymentStatus === 'Failed';

      return {
        ...order,
        orderDateFormatted: fmtDate(order.orderDate),
        estimatedDeliveryFormatted: fmtDate(order.estimatedDelivery),
        products: mappedProducts,
        totalCancelledRefunds,
        totalReturnedRefunds,
        finalAmountPaid,
        canDownloadInvoice: finalAmountPaid > 0 && canDownloadInvoice,
        isPaymentFailed,
      };
    });

    res.render('user/myOrders', {
      layout: 'main',
      orders,
      searchQuery,
    });
  } catch (err) {
    console.error('getUserOrders error:', err);
    res.redirect('/user/home');
  }
};

export const cancelOrder = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId)
      return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { orderId, itemId, reason } = req.body;

    if (!reason || reason.trim().length < 3 || !/[A-Za-z]/.test(reason)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid cancellation reason. Please provide a valid reason.',
      });
    }

    const order = await Order.findOne({ orderId, userId });

    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });

    const item = order.products.id(itemId);
    if (!item)
      return res
        .status(404)
        .json({ success: false, message: 'Product not found in this order' });

    if (!['Pending', 'Confirmed', 'Packed'].includes(item.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: 'This product cannot be cancelled after shipping.',
      });
    }

    item.orderStatus = 'Cancelled';
    item.cancelStatus = 'Cancelled';
    item.cancellationReason = reason || 'User requested cancellation';
    item.trackingTimeline.push({
      status: 'Cancelled',
      message: `Product cancelled by user. Reason: ${item.cancellationReason}`,
      timestamp: new Date(),
      completed: true,
    });

    // Restore stock
    await Variant.findByIdAndUpdate(item.variantId, {
      $inc: { stock: item.quantity },
    });

    // Process Automated Refund
    const refundData = await calculateRefundAmount(
      order,
      item._id.toString(),
      item.quantity
    );
    let refundAmount = refundData.refundAmount;

    // "Full Order Cancellation: Refund shipping charge."
    const willBeAllCancelled = order.products.every(
      (p) =>
        p._id.toString() === item._id.toString() ||
        p.orderStatus === 'Cancelled'
    );

    if (willBeAllCancelled && order.deliveryCharge > 0) {
      refundAmount += order.deliveryCharge;
    }

    if (
      order.paymentStatus === 'Paid' &&
      order.paymentMethod !== 'COD' &&
      refundAmount > 0
    ) {
      item.refundAmountProcessed = refundAmount;
      item.refundStatus = 'Processed';

      await userSchema.findByIdAndUpdate(userId, {
        $inc: { walletBalance: refundAmount },
      });
      const newTxn = new WalletTransaction({
        userId,
        type: 'Credit',
        amount: refundAmount,
        description: `Refund for Cancelled Product (${item.productName})${willBeAllCancelled ? ' + Shipping' : ''}${refundData.thresholdBroken ? ' (Discount Revoked)' : ''}`,
        orderId: order.orderId,
        status: 'Success',
      });
      await newTxn.save();
    }

    // Check if all items are cancelled, if so update order status
    const allCancelled = order.products.every(
      (p) => p.orderStatus === 'Cancelled'
    );
    if (allCancelled) {
      order.orderStatus = 'Cancelled';
    }

    await order.save();
    res.json({ success: true, message: 'Product cancelled successfully.' });
  } catch (err) {
    console.error('cancelOrder error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const trackOrder = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const userId = req.session.user?.id;
    if (!orderId || !itemId || !userId) return res.redirect('/user/home');

    const order = await Order.findOne({ orderId, userId }).lean();
    if (!order) return res.redirect('/user/home');

    const item = order.products.find((p) => p._id.toString() === itemId);
    if (!item) return res.redirect('/user/orders');

    const fmtDate = (d) =>
      new Date(d).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    const fmtTime = (d) =>
      new Date(d).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      });

    const activityLogs = (item.trackingTimeline || [])
      .map((log) => ({
        ...log,
        dateFormatted: fmtDate(log.timestamp),
        timeFormatted: fmtTime(log.timestamp),
      }))
      .reverse();

    const shippingPartner =
      order.deliveryType === 'Fast'
        ? 'BlueDart Priority Logistics'
        : 'FedEx Premium Logistics';

    res.render('user/trackOrder', {
      layout: 'main',
      order: {
        ...order,
        estimatedDeliveryFormatted: fmtDate(order.estimatedDelivery),
      },
      item,
      activityLogs,
      shippingPartner,
    });
  } catch (err) {
    console.error('trackOrder error:', err);
    res.redirect('/user/orders');
  }
};

export const loadOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user?.id;
    if (!orderId || !userId) return res.redirect('/user/login');

    const order = await Order.findOne({ orderId, userId }).lean();
    if (!order) return res.redirect('/user/orders');

    const settings = (await Settings.findOne().lean()) || {
      returnPeriodDays: 7,
    };
    const userReviews = await Review.find({ userId }).lean();
    const reviewedSet = new Set(
      userReviews.map((r) => `${r.orderId}_${r.productId.toString()}`)
    );
    const fmtDate = (d) =>
      new Date(d).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

    const mappedProducts = order.products.map((item) => {
      let canCancel = false;
      let canTrack = false;
      let canReturn = false;
      let showReview = false;
      let isReturned = false;

      const st = item.orderStatus;
      if (['Pending', 'Confirmed', 'Packed'].includes(st)) {
        canCancel = true;
      }

      if (
        [
          'Pending',
          'Confirmed',
          'Packed',
          'Shipped',
          'Out for Delivery',
          'Delivered',
        ].includes(st)
      ) {
        canTrack = true;
      }

      if (st === 'Delivered') {
        const key = `${order.orderId}_${item.productId.toString()}`;
        showReview = !reviewedSet.has(key);
        const deliveryLog = (item.trackingTimeline || []).find(
          (t) => t.status === 'Delivered'
        );
        const deliveryDate = deliveryLog
          ? deliveryLog.timestamp
          : order.updatedAt;
        const daysSinceDelivery =
          (new Date() - new Date(deliveryDate)) / (1000 * 60 * 60 * 24);
        const rpd = settings.returnPeriodDays || 7;
        if (daysSinceDelivery <= rpd) {
          canReturn = true;
        }
      }

      if (
        [
          'Return Requested',
          'Return Approved',
          'Pickup Scheduled',
          'Return Picked',
          'Refund Processed',
          'Return Rejected',
          'Returned',
        ].includes(st)
      ) {
        isReturned = true;
      }

      // Tracking map level (1 to 4)
      let trackingLevel = 0;
      let trackingStatusText = st;
      if (st === 'Pending' || st === 'Confirmed') trackingLevel = 1;
      else if (st === 'Packed') trackingLevel = 2;
      else if (st === 'Shipped' || st === 'Out for Delivery') trackingLevel = 3;
      else if (st === 'Delivered') trackingLevel = 4;
      else if (isReturned) {
        trackingLevel = 4; // Completed delivery first
      }

      let tWidth = '0%';
      let s1 = false,
        s2 = false,
        s3 = false,
        s4 = false;

      if (trackingLevel >= 1) {
        s1 = true;
        tWidth = '0%';
      }
      if (trackingLevel >= 2) {
        s2 = true;
        tWidth = '33%';
      }
      if (trackingLevel >= 3) {
        s3 = true;
        tWidth = '66%';
      }
      if (trackingLevel >= 4) {
        s4 = true;
        tWidth = '100%';
      }

      // Suppress all actions for failed-payment orders
      if (order.paymentStatus === 'Failed') {
        return {
          ...item,
          canCancel: false,
          canTrack: false,
          canReturn: false,
          showReview: false,
          isReturned: false,
          trackingLevel: 0,
          trackingStatusText: 'Payment Failed',
          trackBarWidth: '0%',
          step1: false,
          step2: false,
          step3: false,
          step4: false,
        };
      }

      return {
        ...item,
        canCancel,
        canTrack,
        canReturn,
        showReview,
        isReturned,
        trackingLevel,
        trackingStatusText,
        trackBarWidth: tWidth,
        step1: s1,
        step2: s2,
        step3: s3,
        step4: s4,
      };
    });

    const canDownloadInvoice =
      order.orderStatus === 'Delivered' ||
      (['Razorpay', 'Wallet', 'Online', 'Card', 'UPI', 'Stripe'].includes(
        order.paymentMethod
      ) &&
        order.paymentStatus === 'Paid') ||
      mappedProducts.some((p) =>
        [
          'Delivered',
          'Return Requested',
          'Return Approved',
          'Pickup Scheduled',
          'Return Picked',
          'Refund Processed',
          'Return Rejected',
          'Returned',
        ].includes(p.orderStatus)
      );

    let totalCancelledRefunds = 0;
    let totalReturnedRefunds = 0;

    mappedProducts.forEach((item) => {
      if (item.orderStatus === 'Cancelled' && item.refundAmountProcessed) {
        totalCancelledRefunds += item.refundAmountProcessed;
      }
      if (
        ['Returned', 'Refund Processed'].includes(item.orderStatus) &&
        item.refundAmountProcessed
      ) {
        totalReturnedRefunds += item.refundAmountProcessed;
      }
    });

    let finalAmountPaid =
      order.totalAmount - totalCancelledRefunds - totalReturnedRefunds;

    // Apply recalculation for COD orders dynamically in the UI
    let displayOrder = { ...order, isCOD: order.paymentMethod === 'COD' };
    if (order.paymentMethod === 'COD') {
      const nonCancelledProducts = order.products.filter(
        (p) => p.orderStatus !== 'Cancelled'
      );
      const activeProducts = order.products.filter(
        (p) =>
          !['Cancelled', 'Returned', 'Refund Processed'].includes(p.orderStatus)
      );

      const recalculatedCancelled = await calculateActiveOrderTotals(
        order,
        nonCancelledProducts
      );
      const recalculatedAll = await calculateActiveOrderTotals(
        order,
        activeProducts
      );

      // Derive the exact drops
      const cancelledDrop =
        order.totalAmount - recalculatedCancelled.finalAmountPaid;
      const returnedDrop =
        recalculatedCancelled.finalAmountPaid - recalculatedAll.finalAmountPaid;

      displayOrder.totalAmount = order.totalAmount; // Preserve exact original total
      totalCancelledRefunds = cancelledDrop > 0 ? cancelledDrop : 0;
      totalReturnedRefunds = returnedDrop > 0 ? returnedDrop : 0;
      finalAmountPaid = recalculatedAll.finalAmountPaid;
    }

    const isPaymentFailed = order.paymentStatus === 'Failed';

    res.render('user/orderDetails', {
      layout: 'main',
      order: {
        ...displayOrder,
        subtotalSalePrice:
          displayOrder.subtotalMrp - (displayOrder.discount || 0),
        orderDateFormatted: fmtDate(order.orderDate),
        estimatedDeliveryFormatted: fmtDate(order.estimatedDelivery),
        products: mappedProducts,
        totalCancelledRefunds,
        totalReturnedRefunds,
        finalAmountPaid,
        canDownloadInvoice: finalAmountPaid > 0 && canDownloadInvoice,
        isPaymentFailed,
      },
    });
  } catch (err) {
    console.error('loadOrderDetails error:', err);
    res.redirect('/user/orders');
  }
};

export const downloadInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user?.id;

    if (!orderId || !userId)
      return res.status(401).json({ success: false, message: 'Unauthorized' });

    const order = await Order.findOne({ orderId, userId }).lean();
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });

    const hideStatuses = ['Cancelled', 'Returned', 'Refund Processed'];
    const invoiceProducts = order.products.filter(
      (p) => !hideStatuses.includes(p.orderStatus)
    );

    if (invoiceProducts.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          'Invoice is only available for delivered products or successful online payments.',
      });
    }

    const doc = new PDFDocument({ margin: 50 });
    const filename = `Invoice-${order.orderId}.pdf`;

    res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);

    doc
      .fillColor('#000000')
      .fontSize(26)
      .text('TYMORA', { align: 'center', font: 'Times-Bold' });
    doc
      .fontSize(10)
      .fillColor('#666666')
      .text('The Pinnacle of Luxury Timepieces', {
        align: 'center',
        font: 'Times-Italic',
      });
    doc.moveDown(2);

    doc
      .fontSize(18)
      .fillColor('#000000')
      .text('TAX INVOICE', { align: 'left', font: 'Helvetica-Bold' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Order ID: ${order.orderId}`);
    doc.text(`Order Date: ${new Date(order.orderDate).toLocaleDateString()}`);
    doc.text(`Invoice Date: ${new Date().toLocaleDateString()}`);
    doc.text(`Payment Method: ${order.paymentMethod}`);
    doc.text(`Payment Status: ${order.paymentStatus}`);
    doc.moveDown();

    doc.fontSize(12).font('Helvetica-Bold').text('Billed To:');
    doc.fontSize(10).font('Helvetica');
    doc.text(`${order.shippingAddress.fullName}`);
    doc.text(`${order.shippingAddress.addressLine}`);
    doc.text(
      `${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}`
    );
    doc.text(`Phone: +91 ${order.shippingAddress.phone}`);
    doc.moveDown(2);

    const tableTop = doc.y;
    doc.font('Helvetica-Bold');
    doc.text('Product Details', 50, tableTop, { width: 170 });
    doc.text('Status', 230, tableTop, { width: 80 });
    doc.text('Qty', 315, tableTop, { width: 30 });
    doc.text('MRP', 350, tableTop, { width: 60 });
    doc.text('Disc%', 415, tableTop, { width: 40 });
    doc.text('Price', 460, tableTop, { width: 55 });
    doc.text('Total', 515, tableTop, { width: 60 });

    doc
      .moveTo(50, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .strokeColor('#cccccc')
      .stroke();

    let yPosition = tableTop + 25;
    doc.font('Helvetica');

    // Recalculate invoice totals based on invoiceProducts (Target State Formula)
    const recalculated = await calculateActiveOrderTotals(
      order,
      invoiceProducts
    );

    for (const item of invoiceProducts) {
      doc.text(`${item.productName} (${item.variantSpecs})`, 50, yPosition, {
        width: 170,
      });
      if (
        [
          'Return Requested',
          'Return Approved',
          'Pickup Scheduled',
          'Return Picked',
          'Refund Processed',
          'Return Rejected',
          'Returned',
        ].includes(item.orderStatus) &&
        item.refundMethod
      ) {
        doc
          .fontSize(8)
          .fillColor('#888')
          .text(`Refund: ${item.refundMethod}`, 50, yPosition + 22, {
            width: 170,
          });
        doc.fontSize(10).fillColor('#000');
      }
      doc.text(`${item.orderStatus}`, 230, yPosition, { width: 80 });
      doc.text(`${item.quantity}`, 315, yPosition, { width: 30 });
      const mrp = item.mrp || item.salePrice;
      const discPct =
        item.discountPercent ||
        (mrp > item.salePrice
          ? Math.round(((mrp - item.salePrice) / mrp) * 100)
          : 0);
      doc.text(`Rs. ${mrp}`, 350, yPosition, { width: 60 });
      doc.text(discPct > 0 ? `${discPct}%` : `-`, 415, yPosition, {
        width: 40,
      });
      doc.text(`Rs. ${item.salePrice}`, 460, yPosition, { width: 55 });
      doc.text(`Rs. ${item.itemTotal}`, 515, yPosition, { width: 60 });
      yPosition += 40;
    }

    doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
    yPosition += 15;

    doc.text('Subtotal:', 380, yPosition);
    doc.text(`Rs. ${recalculated.computedSubtotal}`, 490, yPosition);
    yPosition += 20;

    if (recalculated.invoiceOfferDiscount > 0) {
      doc.text(
        `Offer Applied (${order.offerName || 'Offer'}):`,
        380,
        yPosition
      );
      doc.text(
        `- Rs. ${recalculated.invoiceOfferDiscount.toFixed(2)}`,
        490,
        yPosition
      );
      yPosition += 20;
    }

    if (recalculated.invoiceCouponDiscount > 0) {
      doc.text(
        `Coupon Applied (${order.couponCode || 'Coupon'}):`,
        380,
        yPosition
      );
      doc.text(
        `- Rs. ${recalculated.invoiceCouponDiscount.toFixed(2)}`,
        490,
        yPosition
      );
      yPosition += 20;
    }

    doc.text('CGST (9%):', 380, yPosition);
    doc.text(`Rs. ${recalculated.invoiceCgst}`, 490, yPosition);
    yPosition += 20;

    doc.text('SGST (9%):', 380, yPosition);
    doc.text(`Rs. ${recalculated.invoiceSgst}`, 490, yPosition);
    yPosition += 20;

    if (recalculated.deliveryCharge > 0) {
      doc.text('Delivery Charge:', 380, yPosition);
      doc.text(`Rs. ${recalculated.deliveryCharge}`, 490, yPosition);
      yPosition += 20;
    }

    if (recalculated.codCharge > 0) {
      doc.text('COD Charge:', 380, yPosition);
      doc.text(`Rs. ${recalculated.codCharge}`, 490, yPosition);
      yPosition += 20;
    }

    doc.moveTo(380, yPosition).lineTo(550, yPosition).stroke();
    yPosition += 15;

    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#d4af37')
      .text('Total Paid:', 380, yPosition);
    doc.text(`Rs. ${recalculated.finalAmountPaid}`, 490, yPosition);

    doc.end();
  } catch (err) {
    console.error('downloadInvoice error:', err);
    res
      .status(500)
      .json({ success: false, message: 'Error generating invoice' });
  }
};

export const requestReturn = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId)
      return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { orderId, itemId, reason } = req.body;

    if (!reason || reason.trim().length < 3 || !/[A-Za-z]/.test(reason)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid return reason. Please provide a valid reason.',
      });
    }

    const order = await Order.findOne({ orderId, userId });

    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });

    const item = order.products.id(itemId);
    if (!item)
      return res
        .status(404)
        .json({ success: false, message: 'Product not found' });

    if (item.orderStatus !== 'Delivered') {
      return res.status(400).json({
        success: false,
        message: 'Returns are only allowed after delivery.',
      });
    }

    const settings = (await Settings.findOne()) || { returnPeriodDays: 7 };
    const deliveryDate =
      item.trackingTimeline.find((t) => t.status === 'Delivered')?.timestamp ||
      order.updatedAt;
    const daysSinceDelivery =
      (new Date() - new Date(deliveryDate)) / (1000 * 60 * 60 * 24);

    if (daysSinceDelivery > settings.returnPeriodDays) {
      return res
        .status(400)
        .json({ success: false, message: `Return window expired.` });
    }

    item.orderStatus = 'Return Requested';
    item.returnStatus = 'Requested';
    item.returnReason = reason;
    item.refundMethod = 'Wallet';
    item.returnEvidenceImages = req.files ? req.files.map((f) => f.path) : [];
    item.trackingTimeline.push({
      status: 'Return Requested',
      message: `Return requested. Reason: ${reason}`,
      timestamp: new Date(),
      completed: true,
    });

    // Bridge for admin panel: surface the return request to the root order
    order.orderStatus = 'Return Requested';
    order.returnReason = reason;

    await order.save();
    res.json({
      success: true,
      message: 'Return request submitted successfully.',
    });
  } catch (err) {
    console.error('requestReturn error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const buyNow = async (req, res) => {
  try {
    const { productId, variantId, quantity } = req.body;

    if (!req.session.user) {
      return res
        .status(401)
        .json({ success: false, message: 'Please login to buy products.' });
    }

    const product = await Product.findOne({ _id: productId });
    const variant = await Variant.findOne({
      _id: variantId,
      product: productId,
    });

    if (!product || !variant)
      return res.json({
        success: false,
        message: 'Product or variant not found',
      });

    if (
      product.status !== 'active' ||
      !!product.deleted_at ||
      variant.status !== 'active' ||
      !!variant.deleted_at
    )
      return res.json({
        success: false,
        message: 'This product is no longer available.',
      });

    if (variant.stock <= 0)
      return res.json({
        success: false,
        message: 'This product is out of stock.',
      });

    req.session.buyNow = {
      productId,
      variantId,
      quantity: parseInt(quantity) || 1,
    };

    req.session.checkoutSource = {
      type: 'buyNow',
      productName: product.name,
    };

    res.json({ success: true, redirectUrl: '/user/checkout' });
  } catch (err) {
    console.error('buyNow error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// CHECKOUT

export const loadCheckout = async (req, res) => {
  try {
    const userId = req.session.user.id;
    let cartItems = [];
    let subtotalMrp = 0;
    let totalDiscount = 0;
    let hasOutOfStock = false;

    if (req.session.buyNow) {
      const { productId, variantId, quantity } = req.session.buyNow;
      const product = await Product.findById(productId).lean();
      const variant = await Variant.findById(variantId).lean();

      if (
        !product ||
        !variant ||
        variant.stock <= 0 ||
        product.status !== 'active' ||
        product.deleted_at ||
        variant.status !== 'active' ||
        variant.deleted_at
      ) {
        delete req.session.buyNow;
        return res.redirect('/user/cart');
      }

      const q = Math.min(quantity, variant.stock, 7);
      const originalPrice = variant.originalPrice || variant.price || 0;
      const salePrice = variant.salePrice || originalPrice;
      const discount = originalPrice - salePrice;

      cartItems.push({
        img: variant.images?.[0] || product.images?.[0] || '',
        name: product.name,
        variantSpecs: `SKU: ${variant.sku}`,
        qty: q,
        total: salePrice * q,
        discountPercentage: discount
          ? Math.round((discount / originalPrice) * 100)
          : 0,
        isOutOfStock: false,
        productId,
        variantId,
      });

      subtotalMrp = originalPrice * q;
      totalDiscount = discount * q;
    } else {
      const cart = await Cart.findOne({ userId }).lean();
      if (!cart || !cart.items.length) return res.redirect('/user/cart');

      for (const item of cart.items) {
        const product = await Product.findById(item.productId).lean();
        const variant = await Variant.findById(item.variantId).lean();

        if (!product || !variant) continue;
        const isInactive =
          product.status !== 'active' ||
          !!product.deleted_at ||
          variant.status !== 'active' ||
          !!variant.deleted_at;
        const isOutOfStock = isInactive || variant.stock <= 0;
        if (isOutOfStock) {
          return res.redirect('/user/cart');
        }

        const q = Math.min(
          item.quantity,
          variant.stock > 0 ? variant.stock : item.quantity,
          7
        );
        const originalPrice = variant.originalPrice || variant.price || 0;
        const salePrice = variant.salePrice || originalPrice;
        const discount = originalPrice - salePrice;

        // Build cart items with fields matching the template
        cartItems.push({
          img: variant.images?.[0] || product.images?.[0] || '',
          name: product.name,
          variantSpecs: `SKU: ${variant.sku}`,
          qty: q,
          mrp: originalPrice,
          salePrice: salePrice,
          originalPrice: originalPrice,
          discountAmount: discount,
          total: salePrice * q,
          discountPercentage: discount
            ? Math.round((discount / originalPrice) * 100)
            : 0,
          isOutOfStock,
          productId: item.productId,
          variantId: item.variantId,
        });

        if (!isOutOfStock) {
          subtotalMrp += originalPrice * q;
          totalDiscount += discount * q;
        }
      }
    }

    const addresses = (await addressModel.find({ userId }).lean()) || [];
    let defaultAddress = null;

    if (addresses.length > 0) {
      const normalizedAddresses = addresses.map((addr) => ({
        ...addr,
        name:
          addr.name ||
          addr.fullName ||
          `${(addr.firstName || '').trim()} ${(addr.lastName || '').trim()}`.trim() ||
          'Guest',
      }));
      defaultAddress =
        normalizedAddresses.find((a) => a.isDefault) || normalizedAddresses[0];
      defaultAddress.name =
        defaultAddress.name ||
        defaultAddress.fullName ||
        `${(defaultAddress.firstName || '').trim()} ${(defaultAddress.lastName || '').trim()}`.trim() ||
        'Guest';
    }

    const subtotal = subtotalMrp - totalDiscount;
    const cgst = Math.round(subtotal * 0.09);
    const sgst = Math.round(subtotal * 0.09);
    const deliveryCharge = 0; // default normal delivery
    const codCharge = 0;
    const totalAmount = subtotal + cgst + sgst + deliveryCharge + codCharge;

    const userDoc = await userSchema.findById(userId).lean();
    const walletBalance = userDoc?.walletBalance || 0;

    // Fetch applicable coupons
    const now = new Date();
    const coupons = await Coupon.find({
      isActive: true,
      isDeleted: { $ne: true },
      startDate: { $lte: now },
      endDate: { $gte: now },
    })
      .sort({ priority: -1, createdAt: -1 })
      .lean();

    const availableCoupons = coupons.filter((c) => {
      const usageCount = c.usedBy
        ? c.usedBy.filter((id) => id.toString() === userId.toString()).length
        : 0;
      return usageCount < (c.perUserLimit || 1);
    });

    const offers = await Offer.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    })
      .sort({ priority: -1, createdAt: -1 })
      .lean();

    const availableOffers = offers.filter((o) => {
      if (o.usageLimit && o.usedCount >= o.usageLimit) return false;
      return true;
    });

    const checkoutSource = req.session.checkoutSource || { type: 'cart' };

    await res.render('user/checkout', {
      layout: 'main',
      checkoutSource,
      cartItems,
      subtotal: subtotal,
      youSaved: totalDiscount,
      hasOutOfStock,
      address: defaultAddress,
      addresses,
      cgst,
      sgst,
      deliveryCharge,
      codCharge,
      totalAmount,
      walletBalance,
      availableCoupons,
      availableOffers,
      checkoutState: req.session.checkoutState || null,
    });
  } catch (err) {
    console.error('loadCheckout error:', err);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

export const calculateCheckout = async (req, res) => {
  try {
    const {
      deliveryType,
      deliveryCharge: clientDeliveryCharge,
      codCharge: clientCodCharge,
      couponCode,
      offerId,
      paymentMethod,
    } = req.body;
    const userId = req.session.user.id;
    let cartItems = [];
    let subtotalMrp = 0;
    let totalDiscount = 0;
    let hasOutOfStock = false;

    if (req.session.buyNow) {
      const { productId, variantId, quantity } = req.session.buyNow;
      const product = await Product.findById(productId).lean();
      const variant = await Variant.findById(variantId).lean();
      if (
        !product ||
        !variant ||
        variant.stock <= 0 ||
        product.status !== 'active' ||
        product.deleted_at ||
        variant.status !== 'active' ||
        variant.deleted_at
      ) {
        return res.json({ success: false, message: 'Product unavailable' });
      }
      const q = Math.min(quantity, variant.stock, 7);
      const originalPrice = variant.originalPrice || variant.price || 0;
      const salePrice = variant.salePrice || originalPrice;
      const discount = originalPrice - salePrice;

      cartItems.push({
        img: variant.images?.[0] || product.images?.[0] || '',
        name: product.name,
        variantSpecs: `SKU: ${variant.sku}`,
        qty: q,
        mrp: originalPrice,
        salePrice: salePrice,
        originalPrice: originalPrice,
        discountAmount: discount,
        total: salePrice * q,
        discountPercentage: discount
          ? Math.round((discount / originalPrice) * 100)
          : 0,
        isOutOfStock: false,
        productId,
        variantId,
      });

      subtotalMrp = originalPrice * q;
      totalDiscount = discount * q;
    } else {
      const cart = await Cart.findOne({ userId }).lean();
      if (!cart || !cart.items.length) {
        return res.json({ success: false, message: 'Cart is empty' });
      }
      for (const item of cart.items) {
        const product = await Product.findById(item.productId).lean();
        const variant = await Variant.findById(item.variantId).lean();
        if (!product || !variant) continue;
        const isInactive =
          product.status !== 'active' ||
          !!product.deleted_at ||
          variant.status !== 'active' ||
          !!variant.deleted_at;
        const isOutOfStock = isInactive || variant.stock <= 0;
        if (isOutOfStock) hasOutOfStock = true;
        const q = Math.min(
          item.quantity,
          variant.stock > 0 ? variant.stock : item.quantity,
          7
        );
        const originalPrice = variant.originalPrice || variant.price || 0;
        const salePrice = variant.salePrice || originalPrice;
        const discount = originalPrice - salePrice;

        cartItems.push({
          img: variant.images?.[0] || product.images?.[0] || '',
          name: product.name,
          variantSpecs: `SKU: ${variant.sku}`,
          qty: q,
          mrp: originalPrice,
          salePrice: salePrice,
          originalPrice: originalPrice,
          discountAmount: discount,
          total: salePrice * q,
          discountPercentage: discount
            ? Math.round((discount / originalPrice) * 100)
            : 0,
          isOutOfStock,
          isInactive,
          unavailableReason: isInactive
            ? 'inactive'
            : variant.stock <= 0
              ? 'out_of_stock'
              : null,
          productId: item.productId,
          variantId: item.variantId,
        });

        subtotalMrp += originalPrice * q;
        totalDiscount += discount * q;
      }
    }

    let initialSubtotal = subtotalMrp - totalDiscount;
    const now = new Date();

    // ── Helper: compute discount amount for a coupon doc ──────────────────
    function calcCouponDiscount(coupon, subtotal) {
      let d =
        coupon.discountType === 'percentage'
          ? (subtotal * coupon.discountValue) / 100
          : coupon.discountValue;
      if (coupon.maxDiscountLimit && d > coupon.maxDiscountLimit)
        d = coupon.maxDiscountLimit;
      if (d > subtotal) d = subtotal;
      return Math.round(d);
    }

    // ── Helper: compute discount amount for an offer doc ──────────────────
    function calcOfferDiscount(offer, subtotal) {
      let d =
        offer.discountType === 'percentage'
          ? (subtotal * offer.discountValue) / 100
          : offer.discountValue;
      if (offer.maxDiscountLimit && d > offer.maxDiscountLimit)
        d = offer.maxDiscountLimit;
      if (d > subtotal) d = subtotal;
      return Math.round(d);
    }

    // ── Helper: check payment method eligibility ──────────────────────────
    function isPaymentMethodEligible(methods, selectedMethod) {
      if (!methods || methods.length === 0 || methods.includes('All'))
        return true;
      if (!selectedMethod) return true;
      return methods.includes(selectedMethod);
    }

    // ── 1. Load active offers and coupons ────────────────────────────────
    const [activeOffers, activeCoupons] = await Promise.all([
      Offer.find({
        isActive: true,
        startDate: { $lte: now },
        endDate: { $gte: now },
      }).lean(),
      Coupon.find({
        isActive: true,
        isDeleted: { $ne: true },
        startDate: { $lte: now },
        endDate: { $gte: now },
      }).lean(),
    ]);

    // ── 2. Filter eligible offers ─────────────────────────────────────────
    const eligibleOffers = hasOutOfStock
      ? []
      : activeOffers
        .filter((o) => {
          if (o.usageLimit && o.usedCount >= o.usageLimit) return false;
          if (initialSubtotal < (o.minPurchaseAmount || 0)) return false;
          if (!isPaymentMethodEligible(o.paymentMethods, paymentMethod))
            return false;
          return true;
        })
        .map((o) => ({
          _id: o._id.toString(),
          name: o.name,
          discountType: o.discountType,
          discountValue: o.discountValue,
          offerType: o.offerType,
          calculatedDiscount: calcOfferDiscount(o, initialSubtotal),
        }))
        .sort((a, b) => b.calculatedDiscount - a.calculatedDiscount);

    // ── 3. Filter eligible coupons ────────────────────────────────────────
    const eligibleCoupons = hasOutOfStock
      ? []
      : activeCoupons
        .filter((c) => {
          const used = c.usedBy
            ? c.usedBy.filter((id) => id.toString() === userId.toString())
              .length
            : 0;
          if (used >= (c.perUserLimit || 1)) return false;
          if (initialSubtotal < (c.minPurchase || 0)) return false;
          if (!isPaymentMethodEligible(c.paymentMethods, paymentMethod))
            return false;
          return true;
        })
        .map((c) => ({
          _id: c._id.toString(),
          code: c.code,
          title: c.title,
          discountType: c.discountType,
          discountValue: c.discountValue,
          minPurchase: c.minPurchase,
          calculatedDiscount: calcCouponDiscount(c, initialSubtotal),
        }))
        .sort((a, b) => b.calculatedDiscount - a.calculatedDiscount);

    // ── 4. Best offer suggestion ──────────────────────────────────────────
    const bestOfferSuggestion =
      eligibleOffers.length > 0 ? eligibleOffers[0] : null;
    const bestCouponSuggestion =
      eligibleCoupons.length > 0 ? eligibleCoupons[0] : null;

    // ── 5. Apply selected offer XOR coupon (no stacking) ─────────────────
    let couponDiscount = 0;
    let offerDiscount = 0;
    let couponMessage = '';
    let offerMessage = '';
    let appliedCoupon = null;
    let appliedOffer = null;

    if (offerId && !hasOutOfStock) {
      // User selected an offer — ignore any coupon
      const offer = activeOffers.find((o) => o._id.toString() === offerId);
      if (!offer) {
        offerMessage = 'Offer not found.';
      } else if (!offer.isActive) {
        offerMessage = 'This offer is no longer active.';
      } else if (
        now < new Date(offer.startDate) ||
        now > new Date(offer.endDate)
      ) {
        offerMessage = 'This offer has expired.';
      } else if (offer.usageLimit && offer.usedCount >= offer.usageLimit) {
        offerMessage = 'This offer has reached its usage limit.';
      } else if (initialSubtotal < (offer.minPurchaseAmount || 0)) {
        offerMessage = `Minimum order amount of ₹${offer.minPurchaseAmount} is required.`;
      } else if (
        !isPaymentMethodEligible(offer.paymentMethods, paymentMethod)
      ) {
        offerMessage = `This offer is not valid for ${paymentMethod} payment.`;
      } else {
        offerDiscount = calcOfferDiscount(offer, initialSubtotal);
        appliedOffer = {
          _id: offer._id.toString(),
          name: offer.name,
          offerType: offer.offerType,
          discount: offerDiscount,
        };
      }
    } else if (couponCode && !hasOutOfStock) {
      // User entered/selected a coupon — ignore any offer
      const coupon = activeCoupons.find(
        (c) => c.code === couponCode.toUpperCase()
      );
      if (!coupon) {
        couponMessage = 'Coupon code not found.';
      } else if (!coupon.isActive) {
        couponMessage = 'This coupon is no longer active.';
      } else if (now > new Date(coupon.endDate)) {
        couponMessage = 'This coupon has expired.';
      } else if (now < new Date(coupon.startDate)) {
        couponMessage = 'This coupon is not yet active.';
      } else {
        const used = coupon.usedBy
          ? coupon.usedBy.filter((id) => id.toString() === userId.toString())
            .length
          : 0;
        if (used >= (coupon.perUserLimit || 1)) {
          couponMessage =
            'You have already used this coupon the maximum number of times.';
        } else if (initialSubtotal < (coupon.minPurchase || 0)) {
          couponMessage = `Minimum order amount of ₹${coupon.minPurchase} is required for this coupon.`;
        } else if (
          !isPaymentMethodEligible(coupon.paymentMethods, paymentMethod)
        ) {
          couponMessage = `This coupon is not valid for ${paymentMethod} payment.`;
        } else {
          couponDiscount = calcCouponDiscount(coupon, initialSubtotal);
          appliedCoupon = {
            code: coupon.code,
            title: coupon.title,
            discountType: coupon.discountType,
            discount: couponDiscount,
          };
        }
      }
    }

    const totalPromotionDiscount = couponDiscount + offerDiscount;
    const subtotalAfterDiscounts = initialSubtotal - totalPromotionDiscount;
    const cgst = Math.round(subtotalAfterDiscounts * 0.09);
    const sgst = Math.round(subtotalAfterDiscounts * 0.09);
    let deliveryCharge =
      typeof clientDeliveryCharge !== 'undefined'
        ? Number(clientDeliveryCharge)
        : subtotalAfterDiscounts < 50000
          ? deliveryType === 'Fast'
            ? 50
            : 0
          : 0;
    let codCharge =
      typeof clientCodCharge !== 'undefined' ? Number(clientCodCharge) : 0;
    const totalAmount =
      subtotalAfterDiscounts + cgst + sgst + deliveryCharge + codCharge;

    return res.json({
      success: true,
      cartItems,
      cartItems,
      couponDiscount,
      offerDiscount,
      couponMessage,
      offerMessage,
      appliedCoupon,
      appliedOffer,
      deliveryCharge,
      codCharge,
      cgst,
      sgst,
      hasOutOfStock,
      eligibleOffers,
      eligibleCoupons,
      bestOfferSuggestion,
      bestCouponSuggestion,
      youSaved: totalDiscount + totalPromotionDiscount,
      subtotal: initialSubtotal,
      finalTotal: totalAmount,
    });
  } catch (err) {
    console.error('calculateCheckout error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user.id;
    let {
      addressId,
      paymentMethod,
      deliveryType,
      paymentDetails,
      couponCode,
      offerId,
    } = req.body;

    if (paymentMethod === 'Online') {
      paymentMethod = 'Razorpay';
    }

    req.session.checkoutState = {
      addressId,
      paymentMethod,
      deliveryType,
      couponCode,
      offerId,
    };

    // Validate buyNow product stock and activity
    if (req.session.buyNow) {
      const { productId, variantId, quantity } = req.session.buyNow;
      const product = await Product.findById(productId).lean();
      const variant = await Variant.findById(variantId).lean();
      if (!product) {
        return res.json({ success: false, message: 'Product not found.' });
      }
      if (
        product.status !== 'active' ||
        !!product.deleted_at ||
        variant?.status !== 'active' ||
        !!variant?.deleted_at
      ) {
        return res.json({
          success: false,
          message: `Product "${product.name}" is unavailable and cannot be purchased.`,
        });
      }
      if (!variant || variant.stock < quantity) {
        return res.json({
          success: false,
          message: `Product "${product.name}" is out of stock.`,
        });
      }
    } else {
      // Validate cart items stock and activity
      const cart = await Cart.findOne({ userId }).lean();
      if (!cart || !cart.items.length) {
        return res.json({ success: false, message: 'Cart is empty.' });
      }
      for (const item of cart.items) {
        const prod = await Product.findById(item.productId).lean();
        const varnt = await Variant.findById(item.variantId).lean();
        if (!prod) {
          return res.json({
            success: false,
            message: 'One of the products in your cart was not found.',
          });
        }
        if (
          prod.status !== 'active' ||
          !!prod.deleted_at ||
          varnt?.status !== 'active' ||
          !!varnt?.deleted_at
        ) {
          return res.json({
            success: false,
            message: `Product "${prod.name}" is unavailable and cannot be purchased.`,
          });
        }
        if (!varnt || varnt.stock < item.quantity) {
          return res.json({
            success: false,
            message: `Product "${prod.name}" is out of stock.`,
          });
        }
      }
    }

    if (!addressId)
      return res.json({
        success: false,
        message: 'Please select a shipping address.',
      });
    const address = await addressModel
      .findOne({ _id: addressId, userId })
      .lean();
    if (!address)
      return res.json({ success: false, message: 'Invalid shipping address.' });

    let products = [];
    let subtotalMrp = 0;
    let totalDiscount = 0;

    if (req.session.buyNow) {
      const { productId, variantId, quantity } = req.session.buyNow;
      const product = await Product.findById(productId).lean();
      const variant = await Variant.findById(variantId).lean();

      if (!product || !variant || variant.stock < quantity) {
        return res.json({
          success: false,
          message: 'Some products are out of stock.',
        });
      }

      const q = Math.min(quantity, variant.stock, 7);
      const originalPrice = variant.originalPrice || variant.price || 0;
      const salePrice = variant.salePrice || originalPrice;

      products.push({
        productId,
        variantId,
        productName: product.name,
        productImage: variant.images?.[0] || product.images?.[0] || '',
        variantSpecs: `SKU: ${variant.sku}`,
        quantity: q,
        mrp: originalPrice,
        salePrice,
        itemTotal: salePrice * q,
        discountPercent: variant.discountPercentage || 0,
        orderStatus: 'Pending',
        trackingTimeline: [
          {
            status: 'Pending',
            message: 'Order placed successfully',
            timestamp: new Date(),
            completed: true,
          },
        ],
      });

      subtotalMrp += originalPrice * q;
      totalDiscount += (originalPrice - salePrice) * q;
      // NOTE: buyNow session is cleared only after verifyPayment succeeds
    } else {
      const cart = await Cart.findOne({ userId });
      if (!cart || !cart.items.length)
        return res.json({ success: false, message: 'Cart is empty.' });

      for (const item of cart.items) {
        const product = await Product.findById(item.productId).lean();
        const variant = await Variant.findById(item.variantId);

        if (!product || !variant) {
          return res.json({ success: false, message: 'Product not found.' });
        }
        if (
          product.status !== 'active' ||
          !!product.deleted_at ||
          variant?.status !== 'active' ||
          !!variant?.deleted_at
        ) {
          return res.json({
            success: false,
            message: `Product "${product.name}" is unavailable and cannot be purchased.`,
          });
        }
        if (variant.stock < item.quantity) {
          return res.json({
            success: false,
            message: 'Some products are out of stock.',
          });
        }

        const q = Math.min(item.quantity, variant.stock, 7);
        const originalPrice = variant.originalPrice || variant.price || 0;
        const salePrice = variant.salePrice || originalPrice;

        products.push({
          productId: item.productId,
          variantId: item.variantId,
          productName: product.name,
          productImage: variant.images?.[0] || product.images?.[0] || '',
          variantSpecs: `SKU: ${variant.sku}`,
          quantity: q,
          mrp: originalPrice,
          salePrice,
          itemTotal: salePrice * q,
          discountPercent: variant.discountPercentage || 0,
          orderStatus: 'Pending',
          trackingTimeline: [
            {
              status: 'Pending',
              message: 'Order placed successfully',
              timestamp: new Date(),
              completed: true,
            },
          ],
        });

        subtotalMrp += originalPrice * q;
        totalDiscount += (originalPrice - salePrice) * q;
      }
      // NOTE: cart is cleared only after verifyPayment succeeds
    }

    // Validate cart before proceeding
    if (products.length === 0) {
      return res.json({
        success: false,
        message: 'Your cart is empty. Cannot place order.',
      });
    }

    let initialSubtotal = subtotalMrp - totalDiscount;
    const now = new Date();

    // ── Shared discount helpers ───────────────────────────────────────────
    function calcCouponDiscount(c, sub) {
      let d =
        c.discountType === 'percentage'
          ? (sub * c.discountValue) / 100
          : c.discountValue;
      if (c.maxDiscountLimit && d > c.maxDiscountLimit) d = c.maxDiscountLimit;
      return Math.min(Math.round(d), sub);
    }
    function calcOfferDiscount(o, sub) {
      let d =
        o.discountType === 'percentage'
          ? (sub * o.discountValue) / 100
          : o.discountValue;
      if (o.maxDiscountLimit && d > o.maxDiscountLimit) d = o.maxDiscountLimit;
      return Math.min(Math.round(d), sub);
    }
    function pmEligible(methods, pm) {
      if (!methods || methods.length === 0 || methods.includes('All'))
        return true;
      return methods.includes(pm);
    }

    let couponDiscount = 0;
    let offerDiscount = 0;
    let finalCouponCode = '';
    let finalCouponType = '';
    let finalCouponTitle = '';
    let finalOfferId = '';
    let finalOfferName = '';
    let finalOfferType = '';

    if (offerId && !couponCode) {
      // ── Validate selected offer ───────────────────────────────────────
      const offer = await Offer.findById(offerId).lean();
      if (!offer)
        return res.json({ success: false, message: 'Offer not found.' });
      if (
        !offer.isActive ||
        now < new Date(offer.startDate) ||
        now > new Date(offer.endDate)
      )
        return res.json({
          success: false,
          message: 'This offer has expired or is no longer active.',
        });
      if (offer.usageLimit && offer.usedCount >= offer.usageLimit)
        return res.json({
          success: false,
          message: 'This offer has reached its usage limit.',
        });
      if (initialSubtotal < (offer.minPurchaseAmount || 0))
        return res.json({
          success: false,
          message: `Minimum order of ₹${offer.minPurchaseAmount} required for this offer.`,
        });
      if (!pmEligible(offer.paymentMethods, paymentMethod))
        return res.json({
          success: false,
          message: `This offer is not valid for ${paymentMethod} payment.`,
        });

      offerDiscount = calcOfferDiscount(offer, initialSubtotal);
      finalOfferId = offer._id.toString();
      finalOfferName = offer.name;
      finalOfferType = offer.offerType;
      req._offerId = finalOfferId;
      req._offerDiscount = offerDiscount;
    } else if (couponCode) {
      // ── Validate selected coupon ──────────────────────────────────────
      const coupon = await Coupon.findOne({
        code: couponCode.toUpperCase(),
        isDeleted: { $ne: true },
      }).lean();
      if (!coupon)
        return res.json({ success: false, message: 'Coupon not found.' });
      if (
        !coupon.isActive ||
        now < new Date(coupon.startDate) ||
        now > new Date(coupon.endDate)
      )
        return res.json({
          success: false,
          message: 'This coupon has expired or is not yet active.',
        });

      const usageCount = coupon.usedBy
        ? coupon.usedBy.filter((id) => id.toString() === userId.toString())
          .length
        : 0;
      if (usageCount >= (coupon.perUserLimit || 1))
        return res.json({
          success: false,
          message:
            'You have already used this coupon the maximum number of times.',
        });
      if (initialSubtotal < (coupon.minPurchase || 0))
        return res.json({
          success: false,
          message: `Minimum order of ₹${coupon.minPurchase} required for this coupon.`,
        });
      if (!pmEligible(coupon.paymentMethods, paymentMethod))
        return res.json({
          success: false,
          message: `This coupon is not valid for ${paymentMethod} payment.`,
        });

      couponDiscount = calcCouponDiscount(coupon, initialSubtotal);
      finalCouponCode = coupon.code;
      finalCouponType = coupon.discountType;
      finalCouponTitle = coupon.title;
      req._couponId = coupon._id.toString();
      req._couponDiscount = couponDiscount;
    }

    const totalPromotionDiscount = couponDiscount + offerDiscount;

    // ── Advanced Pricing Breakdown for Refund Recalculation ──
    let remainingCoupon = couponDiscount;
    let remainingOffer = offerDiscount;

    products.forEach((p, index) => {
      p.productOriginalPrice = p.mrp;

      let itemRatio = p.itemTotal / initialSubtotal;
      let pCouponShare = 0;
      let pOfferShare = 0;

      if (index === products.length - 1) {
        pCouponShare = remainingCoupon;
        pOfferShare = remainingOffer;
      } else {
        pCouponShare = Math.round(couponDiscount * itemRatio);
        pOfferShare = Math.round(offerDiscount * itemRatio);
        remainingCoupon -= pCouponShare;
        remainingOffer -= pOfferShare;
      }

      p.couponDiscountShare = pCouponShare;
      p.offerDiscountShare = pOfferShare;
      p.productFinalPaidPrice = p.itemTotal - pCouponShare - pOfferShare;
    });

    const subtotalAfterDiscounts = initialSubtotal - totalPromotionDiscount;
    const cgst = Math.round(subtotalAfterDiscounts * 0.09);
    const sgst = Math.round(subtotalAfterDiscounts * 0.09);
    let deliveryCharge =
      subtotalAfterDiscounts < 50000 ? (deliveryType === 'Fast' ? 50 : 0) : 0;
    let codCharge = paymentMethod === 'COD' ? 30 : 0;
    const totalAmount =
      subtotalAfterDiscounts + cgst + sgst + deliveryCharge + codCharge;

    if (paymentMethod === 'Wallet') {
      const u = await userSchema.findById(userId).lean();
      if ((u.walletBalance || 0) < totalAmount)
        return res.json({
          success: false,
          message: 'Insufficient wallet balance.',
        });
    }

    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(
      estimatedDelivery.getDate() + (deliveryType === 'Fast' ? 2 : 5)
    );

    const orderId = await Order.generateOrderId();

    const order = new Order({
      orderId,
      userId,
      products,
      shippingAddress: {
        fullName: address.fullName || address.name || 'Guest',
        phone: address.phone || '',
        addressLine: address.street || '',
        city: address.city || '',
        state: address.state || '',
        pincode: address.pincode || '',
        addressType: address.type || 'Home',
      },
      paymentMethod,
      paymentDetails: paymentDetails || {},
      orderStatus: 'Pending',
      deliveryType,
      subtotalMrp,
      discount: totalDiscount,
      couponDiscount,
      couponCode: finalCouponCode,
      couponType: finalCouponType,
      offerDiscount,
      offerId: finalOfferId,
      offerName: finalOfferName,
      offerType: finalOfferType,
      deliveryCharge,
      codCharge,
      cgst,
      sgst,
      totalAmount,
      totalSaved: totalDiscount + totalPromotionDiscount,
      estimatedDelivery,
    });

    if (paymentMethod === 'Razorpay') {
      order.orderStatus = 'Payment Pending';
      order.products.forEach((p) => (p.orderStatus = 'Payment Pending'));

      const instance = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });

      const options = {
        amount: Math.round(totalAmount * 100), // amount in smallest currency unit
        currency: 'INR',
        receipt: orderId,
      };

      const razorpayOrder = await instance.orders.create(options);

      order.razorpayOrderId = razorpayOrder.id;
      // Store couponId/offerId for deferred marking after payment success
      if (req._couponId) order.pendingCouponId = req._couponId;
      if (req._offerId) order.pendingOfferId = req._offerId;
      await order.save();

      res.json({
        success: true,
        isRazorpay: true,
        orderId,
        razorpayOrder,
        key: process.env.RAZORPAY_KEY_ID,
        amount: totalAmount,
      });
    } else if (paymentMethod === 'Wallet') {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        // Validate user wallet
        const user = await userSchema.findById(userId).session(session);
        if (!user || user.walletBalance < totalAmount) {
          throw new Error('Insufficient wallet balance.');
        }

        // Deduct wallet
        user.walletBalance -= totalAmount;
        await user.save({ session });

        // Record transaction
        const newTxn = new WalletTransaction({
          userId,
          type: 'Debit',
          amount: totalAmount,
          description: 'Order Payment',
          orderId: orderId,
          status: 'Success',
        });
        await newTxn.save({ session });

        // Update Order
        order.paymentStatus = 'Paid';
        await order.save({ session });

        // Stock decrement with $gte check to prevent overselling
        for (const p of products) {
          const updated = await Variant.findOneAndUpdate(
            { _id: p.variantId, stock: { $gte: p.quantity } },
            { $inc: { stock: -p.quantity } },
            { session, returnDocument: 'after' }
          );
          if (!updated) {
            throw new Error(
              `Sorry, product ${p.productName} went out of stock just now.`
            );
          }
        }

        // Process Coupon immediately since payment succeeded
        if (req._couponId) {
          await Coupon.findByIdAndUpdate(
            req._couponId,
            {
              $push: { usedBy: userId },
              $inc: {
                usedCount: 1,
                totalSavingsGenerated: couponDiscount || 0,
              },
            },
            { session }
          );
        }
        // Process Offer usage tracking
        if (req._offerId) {
          await Offer.findByIdAndUpdate(
            req._offerId,
            {
              $inc: { usedCount: 1 },
            },
            { session }
          );
        }

        // Clear cart
        await Cart.findOneAndUpdate(
          { userId },
          { $set: { items: [] } },
          { session }
        );

        await session.commitTransaction();
        session.endSession();

        if (req.session.buyNow) delete req.session.buyNow;
        res.json({ success: true, orderId });
      } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
      }
    } else {
      // COD Flow
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        await order.save({ session });

        for (const p of products) {
          const updated = await Variant.findOneAndUpdate(
            { _id: p.variantId, stock: { $gte: p.quantity } },
            { $inc: { stock: -p.quantity } },
            { session, returnDocument: 'after' }
          );
          if (!updated) {
            throw new Error(
              `Sorry, product ${p.productName} went out of stock just now.`
            );
          }
        }

        if (req._couponId) {
          await Coupon.findByIdAndUpdate(
            req._couponId,
            {
              $push: { usedBy: userId },
              $inc: {
                usedCount: 1,
                totalSavingsGenerated: couponDiscount || 0,
              },
            },
            { session }
          );
        }
        if (req._offerId) {
          await Offer.findByIdAndUpdate(
            req._offerId,
            {
              $inc: { usedCount: 1 },
            },
            { session }
          );
        }

        await Cart.findOneAndUpdate(
          { userId },
          { $set: { items: [] } },
          { session }
        );

        await session.commitTransaction();
        session.endSession();

        if (req.session.buyNow) delete req.session.buyNow;
        res.json({ success: true, orderId });
      } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
      }
    }
  } catch (err) {
    console.error('placeOrder error:', err);
    res.json({ success: false, message: err.message || 'Server error' });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
    } = req.body;

    //  Validate all fields present
    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !orderId
    ) {
      return res.status(400).json({
        success: false,
        message: 'Missing payment verification fields.',
      });
    }

    //  Verify Razorpay signature
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
    const generated_signature = hmac.digest('hex');

    if (generated_signature !== razorpay_signature) {
      // Mark failed, do NOT modify stock or cart
      await Order.findOneAndUpdate(
        { orderId, paymentStatus: { $ne: 'Paid' } },
        { paymentStatus: 'Failed' }
      );
      return res.json({
        success: false,
        message: 'Payment verification failed. Invalid signature.',
      });
    }

    //  Idempotency: only process if not already paid
    const order = await Order.findOneAndUpdate(
      { orderId, paymentStatus: { $ne: 'Paid' } },
      {
        paymentStatus: 'Paid',
        razorpayPaymentId: razorpay_payment_id,
        orderStatus: 'Pending',
        'products.$[].orderStatus': 'Pending',
      },
      { returnDocument: 'after' }
    );

    if (!order) {
      // Already processed or not found — safe to return success (idempotent)
      return res.json({ success: true, alreadyProcessed: true });
    }

    //  Atomic stock decrement with oversell protection
    for (const p of order.products) {
      const updated = await Variant.findOneAndUpdate(
        { _id: p.variantId, stock: { $gte: p.quantity } },
        { $inc: { stock: -p.quantity } },
        { returnDocument: 'after' }
      );
      if (!updated) {
        // Oversold — rollback payment status and alert
        await Order.findOneAndUpdate(
          { orderId },
          {
            paymentStatus: 'Failed',
            orderStatus: 'Cancelled',
            notes: 'Oversold — stock unavailable at time of payment',
          }
        );
        console.error(
          `[verifyPayment] Oversold product variantId=${p.variantId} orderId=${orderId}`
        );
        return res.json({
          success: false,
          message: `Sorry, ${p.productName} went out of stock just now. A refund will be initiated.`,
        });
      }
    }

    //  Mark coupon as used (deferred from placeOrder)
    if (order.pendingCouponId) {
      await Coupon.findByIdAndUpdate(order.pendingCouponId, {
        $push: { usedBy: order.userId },
        $inc: {
          usedCount: 1,
          totalSavingsGenerated: order.couponDiscount || 0,
        },
      });
      await Order.findByIdAndUpdate(order._id, {
        $unset: { pendingCouponId: '' },
      });
    }

    //  Mark offer as used (deferred from placeOrder)
    if (order.pendingOfferId) {
      await Offer.findByIdAndUpdate(order.pendingOfferId, {
        $inc: { usedCount: 1 },
      });
      await Order.findByIdAndUpdate(order._id, {
        $unset: { pendingOfferId: '' },
      });
    }

    // Clear cart (deferred from placeOrder)
    await Cart.findOneAndUpdate(
      { userId: order.userId },
      { $set: { items: [] } }
    );

    // Clear buyNow session if present
    if (req.session.buyNow) delete req.session.buyNow;

    res.json({ success: true, orderId });
  } catch (err) {
    console.error('verifyPayment error:', err);
    res
      .status(500)
      .json({ success: false, message: 'Error verifying payment' });
  }
};

// Called by the frontend (fire-and-forget) when Razorpay modal is dismissed or payment is declined.
// This is the primary path that writes paymentStatus = 'Failed' to the DB.
export const markPaymentFailed = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.session.user?.id;
    if (!orderId || !userId) return res.json({ success: false });

    await Order.findOneAndUpdate(
      { orderId, userId, paymentStatus: { $ne: 'Paid' } },
      { paymentStatus: 'Failed' }
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('markPaymentFailed error:', err);
    return res.json({ success: false });
  }
};

export const loadPaymentFailed = async (req, res) => {
  try {
    const { orderId, reason } = req.query;
    const userId = req.session.user?.id;

    if (!orderId || !userId) return res.redirect('/user/home');

    // Safety net: if the payment was never explicitly marked as Failed
    // (e.g. direct URL access), mark it now.
    await Order.findOneAndUpdate(
      { orderId, userId, paymentStatus: { $ne: 'Paid' } },
      { paymentStatus: 'Failed' }
    );

    const order = await Order.findOne({ orderId, userId }).lean();
    if (!order) return res.redirect('/user/home');

    const fmt = (date) =>
      new Date(date).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

    res.render('user/paymentFailed', {
      layout: 'main',
      order: {
        ...order,
        subtotalSalePrice: order.subtotalMrp - (order.discount || 0),
        orderDateFormatted: fmt(order.orderDate),
        estimatedDeliveryFormatted: fmt(order.estimatedDelivery),
      },
      reason: reason || null,
    });
  } catch (err) {
    console.error('loadPaymentFailed error:', err);
    res.redirect('/user/home');
  }
};

export const loadOrderSuccess = async (req, res) => {
  try {
    const { orderId } = req.query;
    const userId = req.session.user?.id;

    if (!orderId || !userId) return res.redirect('/user/home');

    const order = await Order.findOne({ orderId, userId }).lean();
    if (!order) return res.redirect('/user/home');

    const fmt = (date) =>
      new Date(date).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    const canCancel = ['Pending', 'Confirmed', 'Packed'].includes(
      order.orderStatus
    );
    const canReturn = order.orderStatus === 'Delivered';
    const canDownloadInvoice =
      order.orderStatus === 'Delivered' ||
      (['Razorpay', 'Wallet', 'Online', 'Card', 'UPI', 'Stripe'].includes(
        order.paymentMethod
      ) &&
        order.paymentStatus === 'Paid');

    res.render('user/orderSuccess', {
      layout: 'main',
      order: {
        ...order,
        subtotalSalePrice: order.subtotalMrp - (order.discount || 0),
        orderDateFormatted: fmt(order.orderDate),
        estimatedDeliveryFormatted: fmt(order.estimatedDelivery),
        canCancel,
        canReturn,
        canDownloadInvoice,
      },
    });
  } catch (err) {
    console.error('loadOrderSuccess error:', err);
    res.redirect('/user/home');
  }
};

export const loadDeals = async (req, res) => {
  try {
    const user = req.session.user;
    const now = new Date();

    let coupons = await Coupon.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    }).lean();

    coupons = coupons.map((c) => ({
      ...c,
      discountStr:
        c.discountType === 'percentage'
          ? `${c.discountValue}% OFF`
          : `₹${c.discountValue} OFF`,
      endDateFormatted: new Date(c.endDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    }));

    let offers = await Offer.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    })
      .populate('applicableProducts', 'name')
      .populate('applicableCategories', 'name')
      .populate('applicableBrands', 'name')
      .lean();

    offers = offers.map((o) => ({
      ...o,
      discountStr:
        o.discountType === 'percentage'
          ? `${o.discountValue}% OFF`
          : `₹${o.discountValue} OFF`,
      endDateFormatted: new Date(o.endDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    }));

    res.render('user/deals', {
      layout: 'main',
      user,
      activePage: 'deals',
      coupons,
      offers,
      couponCount: coupons.length,
      offerCount: offers.length,
      totalDealsCount: coupons.length + offers.length,
    });
  } catch (err) {
    console.error('loadDeals error:', err);
    res.redirect('/user/home');
  }
};

export const loadAboutUs = async (req, res) => {
  try {
    const user = req.session.user;

    // Fetch top visible, featured reviews with user + product names
    const reviews = await Review.find({ isVisible: true, rating: { $gte: 4 } })
      .sort({ isFeatured: -1, rating: -1, createdAt: -1 })
      .limit(6)
      .populate('userId', 'name')
      .populate('productId', 'name')
      .lean();

    const formattedReviews = reviews.map((r) => ({
      ...r,
      customerName: r.userId?.name || 'Valued Customer',
      productName: r.productId?.name || '',
      stars: '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating),
    }));

    res.render('user/aboutUs', {
      layout: 'main',
      user,
      activePage: 'about',
      reviews: formattedReviews,
      hasReviews: formattedReviews.length > 0,
    });
  } catch (err) {
    console.error('loadAboutUs error:', err);
    res.redirect('/user/home');
  }
};

export const loadMyCoupons = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.redirect('/user/login');

    const coupons = await Coupon.find({ isDeleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .lean();

    const now = new Date();
    const formattedCoupons = coupons.map((c) => {
      // Determine user usage
      const usageCount = c.usedBy
        ? c.usedBy.filter((id) => id.toString() === user.id.toString()).length
        : 0;
      const hasUsed = usageCount >= (c.perUserLimit || 1);

      let statusBadge = 'Green';
      let statusText = 'Available';
      let canCopy = true;

      if (!c.isActive) {
        statusBadge = 'Gray';
        statusText = 'Disabled';
        canCopy = false;
      } else if (new Date(c.endDate) < now) {
        statusBadge = 'Red';
        statusText = 'Expired';
        canCopy = false;
      } else if (hasUsed) {
        statusBadge = 'Gold';
        statusText = 'Used';
        canCopy = false;
      }

      return {
        ...c,
        statusBadge,
        statusText,
        canCopy,
        endDateFormatted: new Date(c.endDate).toLocaleDateString('en-US', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
      };
    });

    // Filter out invalid ones if requested by user (Do not show deleted/inactive/invalid)
    const displayCoupons = formattedCoupons.filter(
      (c) => c.statusText !== 'Disabled'
    );

    res.render('user/myCoupons', {
      layout: 'main',
      user,
      coupons: displayCoupons,
      hasCoupons: displayCoupons.length > 0,
    });
  } catch (error) {
    console.error('loadMyCoupons error:', error);
    res.redirect('/user/profile');
  }
};

export const loadMyWallet = async (req, res) => {
  try {
    const userSession = req.session.user;
    if (!userSession) return res.redirect('/user/login');

    const user = await userSchema.findById(userSession.id).lean();

    // Fetch real transactions
    const rawTxns = await WalletTransaction.find({ userId: userSession.id })
      .sort({ createdAt: -1 })
      .lean();

    const transactions = rawTxns.map((t) => {
      const dateStr = new Date(t.createdAt).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      return {
        id: t._id.toString().substring(0, 8).toUpperCase(),
        type: t.description,
        amount: t.amount,
        date: dateStr,
        status: t.status,
        isCredit: t.type === 'Credit',
        orderId: t.orderId,
      };
    });

    res.render('user/myWallet', {
      layout: 'main',
      user,
      walletBalance: user.walletBalance || 0,
      transactions,
      hasTransactions: transactions.length > 0,
    });
  } catch (error) {
    console.error('loadMyWallet error:', error);
    res.redirect('/user/profile');
  }
};

export const topUpWallet = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { amount } = req.body;

    if (!amount || amount < 100) {
      return res.json({
        success: false,
        message: 'Minimum top-up amount is ₹100.',
      });
    }

    const instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const options = {
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: `wt_${Date.now()}`,
    };

    const razorpayOrder = await instance.orders.create(options);

    res.json({
      success: true,
      razorpayOrder,
      key: process.env.RAZORPAY_KEY_ID,
      amount,
    });
  } catch (err) {
    console.error('topUpWallet error:', err);
    res
      .status(500)
      .json({ success: false, message: 'Failed to initiate top-up.' });
  }
};

export const verifyWalletTopUp = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount,
    } = req.body;
    const userId = req.session.user.id;

    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
    const generated_signature = hmac.digest('hex');

    if (generated_signature === razorpay_signature) {
      await userSchema.findByIdAndUpdate(userId, {
        $inc: { walletBalance: Number(amount) },
      });

      const newTxn = new WalletTransaction({
        userId,
        type: 'Credit',
        amount: Number(amount),
        description: 'Wallet Top-Up',
        status: 'Success',
      });
      await newTxn.save();

      res.json({ success: true, message: `₹${amount} added to your wallet!` });
    } else {
      res.json({ success: false, message: 'Payment verification failed.' });
    }
  } catch (err) {
    console.error('verifyWalletTopUp error:', err);
    res
      .status(500)
      .json({ success: false, message: 'Error verifying payment.' });
  }
};

export const searchLive = async (req, res) => {
  try {
    const query = req.query.q?.trim();
    if (!query) {
      return res.json({ success: true, products: [] });
    }

    const regex = new RegExp(query, 'i');

    const categories = await Category.find({
      name: regex,
      is_visible: true,
      deleted_at: null,
    }).select('_id');
    const categoryIds = categories.map((c) => c._id);

    const brands = await Brand.find({ name: regex }).select('_id');
    const brandIds = brands.map((b) => b._id);

    let products = await Product.find({
      status: 'active',
      deleted_at: null,
      $or: [
        { name: regex },
        { category: { $in: categoryIds } },
        { brand: { $in: brandIds } },
      ],
    })
      .populate('category', 'name')
      .populate('brand', 'name')
      .lean();

    // Sort priority: startsWith > containing > newest
    const lowerQuery = query.toLowerCase();
    products.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();

      const aStarts = aName.startsWith(lowerQuery) ? 1 : 0;
      const bStarts = bName.startsWith(lowerQuery) ? 1 : 0;

      if (aStarts !== bStarts) {
        return bStarts - aStarts;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    products = products.slice(0, 8);

    res.json({ success: true, products });
  } catch (error) {
    console.error('searchLive error:', error);
    res.status(500).json({ success: false, message: 'Search failed' });
  }
};
