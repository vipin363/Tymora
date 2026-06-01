import Coupon   from '../model/couponModel.js';
import Product  from '../model/productModel.js';
import Category from '../model/categoryModel.js';
import Brand    from '../model/brandModel.js';
import User     from '../model/userModel.js';


const fmtDate = d => d ? new Date(d).toISOString().split('T')[0] : '';

function buildTargetStr(coupon) {
  if (coupon.offerType === 'global') return 'Global';
  if (coupon.offerType === 'product')
    return (coupon.applicableProducts || []).map(p => p?.name || '').filter(Boolean).join(', ') || '—';
  if (coupon.offerType === 'category')
    return (coupon.applicableCategories || []).map(c => c?.name || '').filter(Boolean).join(', ') || '—';
  if (coupon.offerType === 'brand')
    return (coupon.applicableBrands || []).map(b => b?.name || '').filter(Boolean).join(', ') || '—';
  return '—';
}


// LOAD ADMIN COUPONS PAGE

export const loadAdminCoupons = async (req, res) => {
  try {
    const page  = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip  = (page - 1) * limit;
    const now   = new Date();

    // ── Filters ──────────────────────────────────────────────
    let query = {};
    const { search, status, discountType, sort } = req.query;

    if (search) {
      const rx = new RegExp(search, 'i');
      query.$or = [{ code: rx }, { title: rx }];
    }

    if (status && status !== 'all') {
      if (status === 'active')    query = { ...query, isActive: true,  startDate: { $lte: now }, endDate: { $gte: now } };
      if (status === 'expired')   query = { ...query, endDate: { $lt: now } };
      if (status === 'scheduled') query = { ...query, isActive: true,  startDate: { $gt: now } };
      if (status === 'disabled')  query = { ...query, isActive: false };
    }
    if (discountType && discountType !== 'all') query.discountType = discountType;
    if (req.query.firstTimeOnly === '1')        query.isFirstTimeUserOnly = true;
    if (req.query.autoApply     === '1')        query.autoApply = true;
    if (req.query.freeShipping  === '1')        query.isFreeShipping = true;
    if (req.query.offerType && req.query.offerType !== 'all') query.offerType = req.query.offerType;

    // ── Sort ─────────────────────────────────────────────────
    let sortQ = { createdAt: -1 };
    if (sort === 'oldest')   sortQ = { createdAt: 1 };
    if (sort === 'discount') sortQ = { discountValue: -1 };
    if (sort === 'used')     sortQ = { usedCount: -1 };
    if (sort === 'expiring') sortQ = { endDate: 1 };

    // ── Fetch paginated coupons ───────────────────────────────
    const totalCount = await Coupon.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit) || 1;

    const coupons = await Coupon.find(query)
      .populate('applicableProducts',   'name')
      .populate('applicableCategories', 'name')
      .populate('applicableBrands',     'name')
      .sort(sortQ).skip(skip).limit(limit).lean({ virtuals: true });

    const formattedCoupons = coupons.map(c => ({
      ...c,
      startDateFormatted: fmtDate(c.startDate),
      endDateFormatted:   fmtDate(c.endDate),
      createdAtFormatted: new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      targetsStr:         buildTargetStr(c),
      // re-compute status since lean() removes virtuals partially
      status: !c.isActive ? 'Disabled'
            : c.startDate > now ? 'Scheduled'
            : c.endDate   < now ? 'Expired'
            : 'Active',
    }));

    // ── Analytics ─────────────────────────────────────────────
    const all = await Coupon.find().lean({ virtuals: true });
    const stats = {
      total:     all.length,
      active:    all.filter(c =>  c.isActive && new Date(c.startDate) <= now && new Date(c.endDate) >= now).length,
      expired:   all.filter(c =>  new Date(c.endDate) < now).length,
      scheduled: all.filter(c =>  c.isActive && new Date(c.startDate) > now).length,
      disabled:  all.filter(c => !c.isActive).length,
      totalUsage:  all.reduce((s, c) => s + (c.usedCount || 0), 0),
    };
    stats.expiredDisabled = stats.expired + stats.disabled;

    // ── Reference data for modal dropdowns ────────────────────
    const products   = await Product.find({ deleted_at: null }, 'name _id').lean();
    const categories = await Category.find({ deleted_at: null }, 'name _id').lean();
    const brands     = await Brand.find({}, 'name _id').lean();

    res.render('admin/couponManagement', {
      activePage: 'coupons',
      coupons: formattedCoupons,
      currentPage: page, totalPages,
      search: search || '',
      filterStatus: status || 'all',
      filterDiscountType: discountType || 'all',
      filterOfferType: req.query.offerType || 'all',
      sort: sort || 'latest',
      stats,
      products, categories, brands,
    });
  } catch (err) {
    console.error('loadAdminCoupons:', err);
    res.status(500).send('Server Error');
  }
};


export const createCoupon = async (req, res) => {
  try {
    const d = req.body;
    d.code = (d.code || '').toUpperCase().trim().replace(/\s+/g, '');

    if (!d.code) return res.status(400).json({ success: false, message: 'Coupon code is required' });
    if (!/^[A-Z0-9]{3,20}$/.test(d.code))
      return res.status(400).json({ success: false, message: 'Code must be 3–20 alphanumeric characters (no spaces)' });

    if (await Coupon.findOne({ code: d.code }))
      return res.status(400).json({ success: false, message: 'Coupon code already exists' });

    if (d.discountType === 'percentage' && Number(d.discountValue) > 100)
      return res.status(400).json({ success: false, message: 'Percentage discount cannot exceed 100%' });
    if (Number(d.discountValue) < 0)
      return res.status(400).json({ success: false, message: 'Discount value cannot be negative' });
    if (new Date(d.startDate) >= new Date(d.endDate))
      return res.status(400).json({ success: false, message: 'Expiry date must be after start date' });

    // Per-user vs global limit sanity
    if (Number(d.usageLimit) > 0 && Number(d.perUserLimit) > Number(d.usageLimit))
      return res.status(400).json({ success: false, message: 'Per-user limit cannot exceed global usage limit' });

    // Applicability targets
    _setTargets(d);

    // Booleans from form checkboxes
    ['isFirstTimeUserOnly', 'isFreeShipping', 'isStackable', 'autoApply', 'isActive'].forEach(k => {
      d[k] = d[k] === true || d[k] === 'true' || d[k] === 'on';
    });

    await new Coupon(d).save();
    res.status(201).json({ success: true, message: 'Coupon created successfully' });
  } catch (err) {
    console.error('createCoupon:', err);
    res.status(500).json({ success: false, message: 'Server error creating coupon' });
  }
};

export const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const d = req.body;
    d.code = (d.code || '').toUpperCase().trim().replace(/\s+/g, '');

    if (!d.code) return res.status(400).json({ success: false, message: 'Coupon code is required' });
    if (!/^[A-Z0-9]{3,20}$/.test(d.code))
      return res.status(400).json({ success: false, message: 'Code must be 3–20 alphanumeric characters' });

    if (await Coupon.findOne({ code: d.code, _id: { $ne: id } }))
      return res.status(400).json({ success: false, message: 'Coupon code already in use' });

    if (d.discountType === 'percentage' && Number(d.discountValue) > 100)
      return res.status(400).json({ success: false, message: 'Percentage discount cannot exceed 100%' });
    if (new Date(d.startDate) >= new Date(d.endDate))
      return res.status(400).json({ success: false, message: 'Expiry date must be after start date' });

    if (Number(d.usageLimit) > 0 && Number(d.perUserLimit) > Number(d.usageLimit))
      return res.status(400).json({ success: false, message: 'Per-user limit cannot exceed global usage limit' });

    _setTargets(d);
    ['isFirstTimeUserOnly', 'isFreeShipping', 'isStackable', 'autoApply', 'isActive'].forEach(k => {
      d[k] = d[k] === true || d[k] === 'true' || d[k] === 'on';
    });

    const updated = await Coupon.findByIdAndUpdate(id, d, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ success: false, message: 'Coupon not found' });

    res.json({ success: true, message: 'Coupon updated successfully' });
  } catch (err) {
    console.error('updateCoupon:', err);
    res.status(500).json({ success: false, message: 'Server error updating coupon' });
  }
};


export const toggleCouponStatus = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    res.json({ success: true, message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'}`, isActive: coupon.isActive });
  } catch (err) {
    console.error('toggleCouponStatus:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


export const deleteCoupon = async (req, res) => {
  try {
    const deleted = await Coupon.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Coupon not found' });
    res.json({ success: true, message: 'Coupon deleted permanently' });
  } catch (err) {
    console.error('deleteCoupon:', err);
    res.status(500).json({ success: false, message: 'Server error deleting coupon' });
  }
};


export const validateCouponForCheckout = async ({ code, userId, cartTotal, productIds, categoryIds, brandIds, paymentMethod }) => {
  const coupon = await Coupon.findOne({ code: code.toUpperCase() });
  if (!coupon) return { valid: false, message: 'Invalid coupon code' };

  const now = new Date();
  if (!coupon.isActive)           return { valid: false, message: 'This coupon is disabled' };
  if (coupon.startDate > now)     return { valid: false, message: 'This coupon is not yet active' };
  if (coupon.endDate   < now)     return { valid: false, message: 'This coupon has expired' };
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit)
    return { valid: false, message: 'Coupon usage limit has been reached' };

  const userUsageCount = coupon.usedBy.filter(u => u.toString() === userId.toString()).length;
  if (userUsageCount >= coupon.perUserLimit)
    return { valid: false, message: 'You have already used this coupon the maximum number of times' };

  if (coupon.isFirstTimeUserOnly) {
    // check if user has placed any orders before — caller should inject this flag
  }

  if (coupon.allowedUsers.length > 0 && !coupon.allowedUsers.some(u => u.toString() === userId.toString()))
    return { valid: false, message: 'This coupon is not available for your account' };

  if (cartTotal < coupon.minPurchase)
    return { valid: false, message: `Minimum order value of ₹${coupon.minPurchase} required` };

  // Applicability check
  if (coupon.offerType !== 'global') {
    let eligible = false;
    if (coupon.offerType === 'product')
      eligible = (productIds || []).some(pid => coupon.applicableProducts.map(String).includes(String(pid)));
    if (coupon.offerType === 'category')
      eligible = (categoryIds || []).some(cid => coupon.applicableCategories.map(String).includes(String(cid)));
    if (coupon.offerType === 'brand')
      eligible = (brandIds || []).some(bid => coupon.applicableBrands.map(String).includes(String(bid)));
    if (!eligible) return { valid: false, message: 'Coupon is not applicable for items in your cart' };
  }

  // Payment method check
  if (!coupon.paymentMethods.includes('All') && paymentMethod && !coupon.paymentMethods.includes(paymentMethod))
    return { valid: false, message: `This coupon is not valid for ${paymentMethod} payments` };

  // Compute discount
  let discount = 0;
  if (coupon.discountType === 'percentage') {
    discount = (cartTotal * coupon.discountValue) / 100;
    if (coupon.maxDiscountLimit) discount = Math.min(discount, coupon.maxDiscountLimit);
  } else {
    discount = coupon.discountValue;
  }
  discount = Math.min(discount, cartTotal); // never exceed cart total

  return {
    valid: true,
    couponId: coupon._id,
    discount,
    isFreeShipping: coupon.isFreeShipping,
    message: `Coupon applied! You save ₹${discount.toFixed(2)}`,
  };
};


export const recordCouponUsage = async (couponId, userId, discountAmount) => {
  await Coupon.findByIdAndUpdate(couponId, {
    $inc:  { usedCount: 1, totalSavingsGenerated: discountAmount },
    $push: { usedBy: userId },
  });
};


function _setTargets(d) {
  if (d.offerType !== 'product')  d.applicableProducts   = [];
  if (d.offerType !== 'category') d.applicableCategories = [];
  if (d.offerType !== 'brand')    d.applicableBrands     = [];

  // Ensure arrays
  if (!Array.isArray(d.applicableProducts))   d.applicableProducts   = d.applicableProducts   ? [d.applicableProducts]   : [];
  if (!Array.isArray(d.applicableCategories)) d.applicableCategories = d.applicableCategories ? [d.applicableCategories] : [];
  if (!Array.isArray(d.applicableBrands))     d.applicableBrands     = d.applicableBrands     ? [d.applicableBrands]     : [];
  if (!Array.isArray(d.excludedProducts))     d.excludedProducts     = d.excludedProducts     ? [d.excludedProducts]     : [];
  if (!Array.isArray(d.excludedCategories))   d.excludedCategories   = d.excludedCategories   ? [d.excludedCategories]   : [];
  if (!Array.isArray(d.excludedBrands))       d.excludedBrands       = d.excludedBrands       ? [d.excludedBrands]       : [];
  if (!Array.isArray(d.paymentMethods))       d.paymentMethods       = d.paymentMethods       ? [d.paymentMethods]       : ['All'];
  if (!Array.isArray(d.allowedUsers))         d.allowedUsers         = d.allowedUsers         ? [d.allowedUsers]         : [];
}
