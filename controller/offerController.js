import Offer from '../model/offerModel.js';
import Product from '../model/productModel.js';
import Category from '../model/categoryModel.js';
import Brand from '../model/brandModel.js'; // Assuming you have a brand model based on coupons

const fmtDate = d => d ? new Date(d).toISOString().split('T')[0] : '';

function buildTargetStr(offer) {
  if (offer.offerType === 'global') return 'Global';
  if (offer.offerType === 'product')
    return (offer.applicableProducts || []).map(p => p?.name || '').filter(Boolean).join(', ') || '—';
  if (offer.offerType === 'category')
    return (offer.applicableCategories || []).map(c => c?.name || '').filter(Boolean).join(', ') || '—';
  if (offer.offerType === 'brand')
    return (offer.applicableBrands || []).map(b => b?.name || '').filter(Boolean).join(', ') || '—';
  return '—';
}


export const loadAdminOffers = async (req, res) => {
  try {
    const page  = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip  = (page - 1) * limit;
    const now   = new Date();

    // ── Filters ──────────────────────────────────────────────
    let query = {};
    const { search, status, discountType, sort, type } = req.query;

    if (search) {
      const rx = new RegExp(search, 'i');
      query.$or = [{ name: rx }, { description: rx }];
    }

    if (status && status !== 'all') {
      if (status === 'active')    query = { ...query, isActive: true,  startDate: { $lte: now }, endDate: { $gte: now } };
      if (status === 'expired')   query = { ...query, endDate: { $lt: now } };
      if (status === 'scheduled') query = { ...query, isActive: true,  startDate: { $gt: now } };
      if (status === 'disabled')  query = { ...query, isActive: false };
    }
    
    if (discountType && discountType !== 'all') query.discountType = discountType;
    if (type && type !== 'all') query.offerType = type;

    // ── Sort ─────────────────────────────────────────────────
    let sortQ = { createdAt: -1 };
    if (sort === 'oldest')   sortQ = { createdAt: 1 };
    if (sort === 'discount') sortQ = { discountValue: -1 };
    if (sort === 'used')     sortQ = { usedCount: -1 };
    if (sort === 'expiring') sortQ = { endDate: 1 };

    // ── Fetch & Populate ─────────────────────────────────────
    const totalCount = await Offer.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit) || 1;

    const offers = await Offer.find(query)
      .populate('applicableProducts',   'name')
      .populate('applicableCategories', 'name')
      .populate('applicableBrands',     'name')
      .sort(sortQ).skip(skip).limit(limit).lean({ virtuals: true });

    const formattedOffers = offers.map(o => ({
      ...o,
      targetsStr: buildTargetStr(o),
      startDateFormatted: fmtDate(o.startDate),
      endDateFormatted:   fmtDate(o.endDate),
      isFirstTimeUserOnly: o.allowedUsers === 'first_time'
    }));

    // ── Global Stats ─────────────────────────────────────────
    const all = await Offer.find({}, 'isActive startDate endDate');
    let stats = { total: all.length, active: 0, scheduled: 0, expired: 0, disabled: 0 };
    all.forEach(o => {
      if (!o.isActive) stats.disabled++;
      else if (o.endDate < now) stats.expired++;
      else if (o.startDate > now) stats.scheduled++;
      else stats.active++;
    });

    // ── Reference data for modal dropdowns ────────────────────
    const products   = await Product.find({ deleted_at: null }, 'name _id').lean();
    const categories = await Category.find({ deleted_at: null }, 'name _id').lean();
    const brands     = await Brand.find({}, 'name _id').lean(); // Assuming standard setup

    res.render('admin/offerManagement', { layout: 'admin', 
      activePage: 'offers',
      offers: formattedOffers,
      stats,
      products, categories, brands,
      currentPage: page, totalPages,
      search, filterStatus: status, filterDiscountType: discountType, filterType: type, sort
    });

  } catch (error) {
    console.error("loadAdminOffers error:", error);
    res.status(500).send("Server Error");
  }
};


export const createOffer = async (req, res) => {
  try {
    const {
      name, description, offerBadgeText, isActive,
      discountType, discountValue, maxDiscountLimit, minPurchaseAmount,
      offerType, applicableProducts, applicableCategories, applicableBrands,
      excludedProducts, excludedCategories, excludedBrands,
      allowedUsers, isFirstTimeUserOnly, usageLimit, perUserLimit, paymentMethods,
      startDate, endDate, includesFreeShipping, isStackable, stackableWithCoupons, autoApply, priority
    } = req.body;

    if (!name || !discountType || !discountValue || !offerType || !startDate || !endDate) {
      return res.json({ success: false, message: "Missing required core fields" });
    }

    if (new Date(endDate) <= new Date(startDate)) {
      return res.json({ success: false, message: "End Date must be after Start Date" });
    }

    if (discountType === 'percentage' && (discountValue <= 0 || discountValue > 100)) {
      return res.json({ success: false, message: "Percentage discount must be between 1 and 100" });
    }

    // Safety fallback for empty arrays from client
    const parseArr = arr => Array.isArray(arr) ? arr : (arr ? [arr] : []);

    const offer = new Offer({
      name, description, offerBadgeText,
      isActive: isActive !== false && isActive !== 'false',
      discountType, discountValue,
      maxDiscountLimit: maxDiscountLimit || null,
      minPurchaseAmount: minPurchaseAmount || 0,
      
      offerType,
      applicableProducts:   parseArr(applicableProducts),
      applicableCategories: parseArr(applicableCategories),
      applicableBrands:     parseArr(applicableBrands),
      
      excludedProducts:   parseArr(excludedProducts),
      excludedCategories: parseArr(excludedCategories),
      excludedBrands:     parseArr(excludedBrands),

      allowedUsers: (isFirstTimeUserOnly === true || isFirstTimeUserOnly === 'true') ? 'first_time' : (allowedUsers || 'all'),
      usageLimit: usageLimit || null,
      perUserLimit: perUserLimit || 1,
      paymentMethods: parseArr(paymentMethods),

      startDate, endDate,
      includesFreeShipping: includesFreeShipping === true || includesFreeShipping === 'true',
      isStackable: isStackable === true || isStackable === 'true',
      stackableWithCoupons: stackableWithCoupons === true || stackableWithCoupons === 'true',
      autoApply: autoApply === true || autoApply === 'true',
      priority: priority || 0
    });

    await offer.save();
    res.json({ success: true, message: "Offer created successfully!" });

  } catch (error) {
    console.error("createOffer error:", error);
    res.json({ success: false, message: "Failed to create offer" });
  }
};


export const updateOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, description, offerBadgeText, isActive,
      discountType, discountValue, maxDiscountLimit, minPurchaseAmount,
      offerType, applicableProducts, applicableCategories, applicableBrands,
      excludedProducts, excludedCategories, excludedBrands,
      allowedUsers, isFirstTimeUserOnly, usageLimit, perUserLimit, paymentMethods,
      startDate, endDate, includesFreeShipping, isStackable, stackableWithCoupons, autoApply, priority
    } = req.body;

    if (new Date(endDate) <= new Date(startDate)) {
      return res.json({ success: false, message: "End Date must be after Start Date" });
    }

    const parseArr = arr => Array.isArray(arr) ? arr : (arr ? [arr] : []);

    const updated = await Offer.findByIdAndUpdate(id, {
      name, description, offerBadgeText,
      isActive: isActive !== false && isActive !== 'false',
      discountType, discountValue,
      maxDiscountLimit: maxDiscountLimit || null,
      minPurchaseAmount: minPurchaseAmount || 0,
      
      offerType,
      applicableProducts:   parseArr(applicableProducts),
      applicableCategories: parseArr(applicableCategories),
      applicableBrands:     parseArr(applicableBrands),
      
      excludedProducts:   parseArr(excludedProducts),
      excludedCategories: parseArr(excludedCategories),
      excludedBrands:     parseArr(excludedBrands),

      allowedUsers: (isFirstTimeUserOnly === true || isFirstTimeUserOnly === 'true') ? 'first_time' : (allowedUsers || 'all'),
      usageLimit: usageLimit || null,
      perUserLimit: perUserLimit || 1,
      paymentMethods: parseArr(paymentMethods),

      startDate, endDate,
      includesFreeShipping: includesFreeShipping === true || includesFreeShipping === 'true',
      isStackable: isStackable === true || isStackable === 'true',
      stackableWithCoupons: stackableWithCoupons === true || stackableWithCoupons === 'true',
      autoApply: autoApply === true || autoApply === 'true',
      priority: priority || 0
    }, { new: true });

    if (!updated) return res.json({ success: false, message: "Offer not found" });

    res.json({ success: true, message: "Offer updated successfully!" });
  } catch (error) {
    console.error("updateOffer error:", error);
    res.json({ success: false, message: "Failed to update offer" });
  }
};



export const toggleOfferStatus = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.json({ success: false, message: "Offer not found" });

    offer.isActive = !offer.isActive;
    await offer.save();

    res.json({ success: true, message: `Offer ${offer.isActive ? 'activated' : 'disabled'}!`, isActive: offer.isActive });
  } catch (error) {
    console.error("toggleOfferStatus error:", error);
    res.json({ success: false, message: "Server error" });
  }
};


export const deleteOffer = async (req, res) => {
  try {
    const offer = await Offer.findByIdAndDelete(req.params.id);
    if (!offer) return res.json({ success: false, message: "Offer not found" });

    res.json({ success: true, message: "Offer deleted successfully!" });
  } catch (error) {
    console.error("deleteOffer error:", error);
    res.json({ success: false, message: "Server error" });
  }
};
