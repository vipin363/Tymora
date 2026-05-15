import Admin from "../model/adminModel.js";
import User from "../model/userModel.js";
import Address from "../model/addressModel.js"
import bcrypt from "bcryptjs";
import { generateAndSaveOtp } from "../services/otpService.js";
import Category from "../model/categoryModel.js";
import { v2 as cloudinary } from 'cloudinary';
import Product from '../model/productModel.js';
import Brand from '../model/brandModel.js';
import Variant from '../model/variantModel.js';
import Material from '../model/materialModel.js';
import SavedColor from '../model/savedColorModel.js';

export const loadLogin = (req, res) => {
  res.render("admin/login");
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email, isAdmin: true });

  

    if (!admin) {
      return res.render("admin/login", {
        error: "Invalid email or password",
        email: "",
      });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.render("admin/login", {
        error: "Invalid email or password",
        email: "",
      });
    }
    req.session.admin ={ id:admin._id };

    res.redirect("/admin/dashBoard");
  } catch (err) {
    console.log(err);
    res.render("admin/login", { error: "Something went wrong" });
  }
};

export const loadDashboard = (req, res) => {
  res.render("admin/dashBoard", {
    activePage: "dashboard",
  });
};

export const logout = (req, res) => {
  req.session.admin = null;
  res.redirect("/admin/login");
};

export const loadForgotPassword = (req, res) => {
  res.render("admin/forgotPassword");
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.render("admin/forgotPassword", { error: "Email required" });
    }

    const admin = await Admin.findOne({ email, isAdmin: true });

    if (!admin) {
      return res.render("admin/forgotPassword", {
        error: "Email not registered",
      });
    }

   

    req.session.resetEmail = email;

    await generateAndSaveOtp({ email, purpose: "forgot_password" });

    await req.session.save();
    
    res.redirect("/admin/otp");
  } catch (err) {
    console.log(err);
    res.render("admin/forgotPassword", { error: "Something went wrong" });
  }
};

export const resetAdminPassword = async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;

    const email = req.session.resetEmail;

    if (!email || !req.session.resetVerified) {
      return res.redirect("/admin/forgotPassword");
    }

    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.redirect("/admin/login");
    }

    if (!newPassword || !confirmPassword) {
      return res.render("admin/resetPassword", {
        error: "All fields required",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.render("admin/resetPassword", {
        error: "Passwords do not match",
      });
    }

    const isSame = await bcrypt.compare(newPassword, admin.password);

    if (isSame) {
      return res.render("admin/resetPassword", {
        error: "New password must be different from old password",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    admin.password = hashedPassword;
    await admin.save();

    req.session.resetEmail = null;

    req.session.resetVerified = null;

    res.redirect("/admin/login");
  } catch (err) {
    console.log(err);
    res.render("admin/resetPassword", { error: "Something went wrong" });
  }
};

export const loadUsers = async (req, res) => {
  try {
    const search = req.query.search || "";
    const sortOption = req.query.sort || "latest";
    const statusFilter = req.query.status || "all";
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;

    const query = {
      $or: [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ],
    };

    if (statusFilter === "blocked") {
  query.isBlocked = true;
} else if (statusFilter === "active") {
  query.isBlocked = false;
}

    let sortQuery = {};

    if (sortOption === "latest") {
      sortQuery = { createdAt: -1 };
    } else if (sortOption === "oldest") {
      sortQuery = { createdAt: 1 };
    }

    const users = await User.find(query)
      .sort( sortQuery )
      .skip(skip)
      .limit(limit);

    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isBlocked: false });
    const blockedUsers = await User.countDocuments({ isBlocked: true });

    const totalPages = Math.ceil(totalUsers / limit);

    const formattedUsers = users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      phone: u.phone || "-",
      avatar: u.avatar || null,
      initials: u.name?.charAt(0).toUpperCase() || "U",
      status: u.isBlocked ? "blocked" : "active",
      joined: u.createdAt?.toDateString(),
    }));

    res.render("admin/userManagement", {
      users: formattedUsers,
      currentPage: page,
      totalPages,
      search,
      sort: sortOption,
      activePage: "users",
      stats: {
        totalUsers,
        activeUsers,
        blockedUsers,
        totalRevenue: 0,
      },
    });
  } catch (err) {
    console.log(err);
    res.redirect("/admin/dashBoard");
  }
};

export const blockUser = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { isBlocked: true });
    res.json({ success: true, message: 'User blocked successfully' });
  } catch (err) {
    res.json({ success: false, message: 'Something went wrong' });
  }
};

export const unblockUser = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { isBlocked: false });
    res.json({ success: true, message: 'User unblocked successfully' });
  } catch (err) {
    res.json({ success: false, message: 'Something went wrong' });
  }
};

export const deleteUser = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    res.json({ success: false, message: 'Something went wrong' });
  }
};

export const loadUserProfile = async (req, res) => {
  try {
    const userId = req.params.id;

    const users = await User.find();

    const formattedUsers = users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      phone: u.phone || "-",
      avatar: u.avatar || null,
      initials: u.name?.charAt(0).toUpperCase() || "U",
      status: u.isBlocked ? "blocked" : "active",
      joined: u.createdAt?.toDateString(),
    }));

    const user = await User.findById(userId);

    const defaultAddress = await Address.findOne({ 
  userId, 
  isDefault: true 
});

    const selectedUser = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone || "-",
      address: defaultAddress
    ? `${defaultAddress.street}, ${defaultAddress.city}, ${defaultAddress.state}, ${defaultAddress.pincode}`
    : "No default address",
      avatar: user.avatar,
      initials: user.name?.charAt(0).toUpperCase(),
      status: user.isBlocked ? "blocked" : "active",
      joined: user.createdAt?.toDateString(),
    };

    res.render("admin/userManagement", {
      users: formattedUsers,
      selectedUser,
      activePage: "users"
    });

  } catch (error) {
    console.log(error);
    res.redirect('/admin/users');
  }
};

export const loadCategoryManagement = async (req, res) => {
  try {
    const search = req.query.search || '';
    const status = req.query.status || '';
    const page   = parseInt(req.query.page) || 1;
    const limit  = 4;
    const skip   = (page - 1) * limit;

    let query = {};
    if (status === 'trash') {
      query.deleted_at = { $ne: null };  
    } else {
      query.deleted_at = null;           
      if (status === 'visible') query.is_visible = true;
      if (status === 'hidden')  query.is_visible = false;
    }
    if (search) query.name = { $regex: search, $options: 'i' };

    const categories   = await Category.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    const total        = await Category.countDocuments(query);
    const totalVisible = await Category.countDocuments({ is_visible: true, deleted_at: null });
    const totalHidden  = await Category.countDocuments({ is_visible: false, deleted_at: null });
    const totalAll     = await Category.countDocuments({ deleted_at: null });
    const totalTrashed = await Category.countDocuments({ deleted_at: { $ne: null } });

    
    const productAgg = await Category.aggregate([
      { $match: { deleted_at: null } },
      { $group: { _id: null, total: { $sum: '$quantity_available' } } }
    ]);
    const totalProducts = productAgg[0]?.total || 0;

    const formatted = categories.map(c => ({
      _id:          c._id,
      name:         c.name,
      description:  c.short_description || '',
      productCount: c.quantity_available,
      isVisible:    c.is_visible,
      image:        c.image_url,
      isTrashed:    !!c.deleted_at,
      deletedAt:    c.deleted_at?.toDateString() || '',
    }));

    res.render('admin/categoryManagement', {
      activePage:   'categoryManagement',
      categories:   formatted,
      currentPage:  page,
      totalPages:   Math.ceil(total / limit) || 1,
      search,
      status,
      stats: {
        totalCategories: totalAll,
        visibleCount:    totalVisible,
        hiddenCount:     totalHidden,
        trashedCount:    totalTrashed,
        totalProducts,
      }
    });
  } catch (err) {
    console.log(err);
    res.redirect('/admin/dashboard');
  }
};

export const addCategory = async (req, res) => {
  try {
    const { name, description, quantity } = req.body;  

    
   const existing = await Category.findOne({
  name: { $regex: `^${name.trim()}$`, $options: 'i' }
});
if (existing) {
  const msg = existing.deleted_at
    ? 'A deleted category with this name exists in trash. Restore it instead.'
    : 'A category with this name already exists.';
  return res.json({ success: false, message: msg });
}

    const category = new Category({
      name:               name.trim(),
      short_description:  description || '',
      quantity_available: parseInt(quantity) || 0,
      image_url:          req.file ? req.file.path : '',
      is_visible:         true
    });

    await category.save();

    res.json({
      success: true,
      category: {
        _id:               category._id,
        name:              category.name,
        short_description: category.short_description,
        image_url:         category.image_url,
        quantity:          category.quantity_available,
      }
    });

  } catch (err) {
    console.log('addCategory error:', err);
    if (err.code === 11000) {
      res.json({ success: false, message: 'Category already exists.' });
    } else {
      res.json({ success: false, message: 'Failed to save category.' });
    }
  }
};

export const editCategory = async (req, res) => {
  try {
    const { name, description, quantity, removeImage } = req.body;
    const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    const updateData = {
      name:               name.trim(),
      short_description:  description || '',
      slug,
      quantity_available: parseInt(quantity) || 0,
    };

    
    if (req.file) {
     
      const existing = await Category.findById(req.params.id);
      if (existing?.image_url) {
        const publicId = existing.image_url
          .split('/').slice(-2).join('/').replace(/\.[^.]+$/, '');
        try { await cloudinary.uploader.destroy(publicId); } catch (e) { console.log('Cloudinary delete err:', e); }
      }
      updateData.image_url = req.file.path;

    } else if (removeImage === 'true') {
      const existing = await Category.findById(req.params.id);
      if (existing?.image_url) {
        const publicId = existing.image_url
          .split('/').slice(-2).join('/').replace(/\.[^.]+$/, '');
        try { await cloudinary.uploader.destroy(publicId); } catch (e) { console.log('Cloudinary delete err:', e); }
      }
      updateData.image_url = '';
    }

const updated = await Category.findByIdAndUpdate(req.params.id, updateData, { new: true });

    res.json({
      success:           true,
      image_url:         updated.image_url || '',
      quantity:          updated.quantity_available,
      name:              updated.name,
      short_description: updated.short_description,
      slug:              updated.slug,
    });

  } catch (err) {
    console.log('editCategory error:', err);
    res.json({ success: false, message: 'Failed to update category.' });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    await Category.findByIdAndUpdate(req.params.id, { deleted_at: new Date(),is_visible: false, });
    res.json({ success: true });
  } catch (err) {
    console.log('deleteCategory error:', err);
    res.json({ success: false, message: 'Failed to delete category.' });
  }
};

export const permanentDeleteCategory = async (req, res) => {
  try {
    const cat = await Category.findById(req.params.id);
    if (cat?.image_url) {
      const publicId = cat.image_url.split('/').slice(-2).join('/').replace(/\.[^.]+$/, '');
      try { await cloudinary.uploader.destroy(publicId); } catch (e) { console.log(e); }
    }
    await Category.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: 'Failed to permanently delete.' });
  }
};

export const restoreCategory = async (req, res) => {
  try {
    await Category.findByIdAndUpdate(req.params.id, { 
      deleted_at: null, 
      is_visible: true   
    });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: 'Failed to restore category.' });
  }
};

export const loadTrash = async (req, res) => {
  try {
    const trashed = await Category.find({ deleted_at: { $ne: null } }).sort({ deleted_at: -1 });
    const formatted = trashed.map(c => ({
      _id:         c._id,
      name:        c.name,
      description: c.short_description || '',
      image:       c.image_url || '',
      deletedAt:   c.deleted_at?.toDateString(),
    }));
    res.json({ success: true, categories: formatted });
  } catch (err) {
    res.json({ success: false, message: 'Failed to load trash.' });
  }
};

export const getCategoryStats = async (req, res) => {
  try {
    const total   = await Category.countDocuments({ deleted_at: null });
    const visible = await Category.countDocuments({ deleted_at: null, is_visible: true });
    const hidden  = await Category.countDocuments({ deleted_at: null, is_visible: false });
    const trashed = await Category.countDocuments({ deleted_at: { $ne: null } });
     const productAgg = await Category.aggregate([
      { $match: { deleted_at: null } },
      { $group: { _id: null, total: { $sum: '$quantity_available' } } }
    ]);
    const totalProducts = productAgg[0]?.total || 0;
    res.json({ success: true, total, visible, hidden, trashed, totalProducts });
  } catch (err) {
    res.json({ success: false });
  }
};

export const loadProductManagement = async (req, res) => {
  try {
    const search = req.query.search || '';
    const sort = req.query.sort || 'latest';
    const status = req.query.status || 'all';
    const categoryFilter = req.query.category || 'all';
    const brandFilter = req.query.brand || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;

    const query = { deleted_at: null };

    if (search) {
  
  const variantsBySkuSearch = await Variant.find({
    sku: { $regex: search, $options: 'i' },
    deleted_at: null
  }).distinct('product');

  const brandMatches = await Brand.find({ name: { $regex: search, $options: 'i' } });
  const brandIds = brandMatches.map(b => b._id);

  const orClauses = [
    { name:  { $regex: search, $options: 'i' } },
    { sku:   { $regex: search, $options: 'i' } },
    { brand: { $in: brandIds } },
    { _id:   { $in: variantsBySkuSearch } },
  ];

  if (!isNaN(parseFloat(search))) {
    orClauses.push({ price: parseFloat(search) });
  }

  query.$or = orClauses;
}
    if (status !== 'all') query.status = status;
    if (categoryFilter !== 'all') query.category = categoryFilter;
    if (brandFilter !== 'all') query.brand = brandFilter;

    let sortQuery = {};
    if (sort === 'latest') sortQuery = { createdAt: -1 };
    else if (sort === 'oldest') sortQuery = { createdAt: 1 };
    else if (sort === 'price_asc') sortQuery = { price: 1 };
    else if (sort === 'price_desc') sortQuery = { price: -1 };

    const products = await Product.find(query)
      .populate('category', 'name')
      .populate('brand', 'name')
      .sort(sortQuery)
      .skip(skip)
      .limit(limit);

    const totalCount = await Product.countDocuments(query);
    const totalProducts = await Product.countDocuments({ deleted_at: null });
    const activeProducts = await Product.countDocuments({ deleted_at: null, status: 'active' });
    const inactiveProducts = await Product.countDocuments({ deleted_at: null, status: 'inactive' });
    const outOfStock = await Product.countDocuments({ deleted_at: null, stock: 0 });
    const trashCount = await Product.countDocuments({ deleted_at: { $ne: null } });

    const categories = await Category.find({ deleted_at: null, is_visible: true });
    const brands = await Brand.find().sort({ name: 1 });

    const formatted = products.map(p => {
      let stockStatus = 'IN_STOCK';
      if (p.stock === 0) stockStatus = 'OUT_OF_STOCK';
      else if (p.stock <= 10) stockStatus = 'LOW_STOCK';

      return {
        _id: p._id,
        name: p.name,
        category: p.category?.name || '-',
        brand: p.brand?.name || '-',
        price: p.price,
        stock: p.stock,
        stockStatus,
        status: p.status,
        images: p.images,
        sku: p.sku || '',
        initials: p.name?.charAt(0).toUpperCase(),
      };
    });

    res.render('admin/productManagement', {
      products: formatted,
      categories,
      brands,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit) || 1,
      search,
      sort,
      status,
      category: categoryFilter,
      brand: brandFilter,
      activePage: 'products',
      stats: {
        totalProducts,
        activeProducts,
        inactiveProducts,
        outOfStock,
        trashCount,
      },
    });
  } catch (err) {
    console.log(err);
    res.redirect('/admin/dashboard');
  }
};

export const addProduct = async (req, res) => {
  try {
    const {
      name, category, brand, newBrand, description, gender,
      status, featured, dealOfTheDay,
      // default variant fields
      variantName, sku, strapColor, dialColor, caseColor,
      size, strapMaterial, caseMaterial, price, stock, offerProduct,
      existingImages,
    } = req.body;

    if (!name || !category || !brand) {
      return res.json({ success: false, message: 'Name, category and brand are required.' });
    }

    // Validate default variant required fields
    if (!strapColor || !dialColor || !caseColor || !size || !strapMaterial || !caseMaterial || !price) {
      return res.json({ success: false, message: 'All default variant fields are required.' });
    }

    let brandId = brand;
    if (brand === 'other' && newBrand?.trim()) {
      let existing = await Brand.findOne({ name: { $regex: `^${newBrand.trim()}$`, $options: 'i' } });
      if (!existing) existing = await Brand.create({ name: newBrand.trim() });
      brandId = existing._id;
    }

    // Images come from variant image section (min 3)
    const uploadedImages = req.files ? req.files.map(f => f.path) : [];
    const existingArr = Array.isArray(existingImages)
      ? existingImages : existingImages ? [existingImages] : [];
    const allImages = [...existingArr, ...uploadedImages];

    if (allImages.length < 3) {
      return res.json({ success: false, message: 'At least 3 images are required for the default variant.' });
    }

    // Check SKU uniqueness if provided
    if (sku) {
      const skuExists = await Variant.findOne({ sku });
      if (skuExists) return res.json({ success: false, message: 'SKU already exists.' });
    }

    // Create product (images mirrored from default variant for list display)
    const product = new Product({
      name: name.trim(),
      category,
      brand: brandId,
      description: description || '',
      gender: gender || 'unisex',
      images: allImages,
      status: status || 'active',
      featured: featured === 'true' || featured === true,
      dealOfTheDay: dealOfTheDay === 'true' || dealOfTheDay === true,
      price: parseFloat(price) || 0,
      stock: parseInt(stock) || 0,
    });
    await product.save();

    // Create default variant
    const variant = await Variant.create({
      product: product._id,
      name: variantName?.trim() || name.trim(),
      sku: sku || undefined,
      strapColor, dialColor, caseColor,
      size, strapMaterial, caseMaterial,
      price: parseFloat(price),
      stock: parseInt(stock) || 0,
      images: allImages,
      status: status || 'active',
      offerProduct: offerProduct === 'true' || offerProduct === true,
      isDefault: true,
    });

    // Link default variant back to product
    product.defaultVariant = variant._id;
    await product.save();

    res.json({ success: true, message: 'Product and default variant created successfully.', productId: product._id });
  } catch (err) {
    console.log(err);
    res.json({ success: false, message: err.message || 'Failed to add product.' });
  }
};

export const editProduct = async (req, res) => {
  try {
    const {
      name, category, brand, newBrand, description, gender,
      status, featured, dealOfTheDay,
    } = req.body;

    let brandId = brand;
    if (brand === 'other' && newBrand?.trim()) {
      let existing = await Brand.findOne({ name: { $regex: `^${newBrand.trim()}$`, $options: 'i' } });
      if (!existing) existing = await Brand.create({ name: newBrand.trim() });
      brandId = existing._id;
    }

    const updateData = {
      name: name.trim(),
      category,
      brand: brandId,
      description: description || '',
      gender: gender || 'unisex',
      status: status || 'active',
      featured: featured === 'true' || featured === true,
      dealOfTheDay: dealOfTheDay === 'true' || dealOfTheDay === true,
    };

    await Product.findByIdAndUpdate(req.params.id, updateData);

    if (status === 'inactive') {
      await Variant.updateMany({ product: req.params.id }, { status: 'inactive' });
    }

    res.json({ success: true, message: 'Product updated.' });
  } catch (err) {
    console.log(err);
    res.json({ success: false, message: 'Failed to update product.' });
  }
};

export const getProductJson = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name _id')
      .populate('brand', 'name _id');
    if (!product) return res.json({ success: false, message: 'Not found' });

    let defaultVariant = null;
    if (product.defaultVariant) {
      defaultVariant = await Variant.findOne({ _id: product.defaultVariant, deleted_at: null });
    }
    if (!defaultVariant) {
      defaultVariant = await Variant.findOne({ product: product._id, isDefault: true, deleted_at: null });
    }

    res.json({
      _id:          product._id,
      name:         product.name,
      categoryId:   product.category?._id,
      brandId:      product.brand?._id,
      description:  product.description,
      gender:       product.gender,
      images:       defaultVariant?.images?.length ? defaultVariant.images : product.images,
      status:       product.status,
      featured:     product.featured,
      dealOfTheDay: product.dealOfTheDay,
      discount:     product.discount || 0,
      price:        defaultVariant?.price ?? product.price,
      stock:        defaultVariant?.stock ?? product.stock,
      sku:          defaultVariant?.sku || product.sku || '',
      offerProduct: defaultVariant?.offerProduct || false,
    });
  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }
};

export const softDeleteProduct = async (req, res) => {
  try {
    await Product.findByIdAndUpdate(req.params.id, { deleted_at: new Date(), status: 'inactive' });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: 'Failed to delete.' });
  }
};

export const loadProductTrash = async (req, res) => {
  try {
    const trashed = await Product.find({ deleted_at: { $ne: null } })
      .populate('category', 'name')
      .populate('brand', 'name')
      .sort({ deleted_at: -1 });
    const formatted = trashed.map(p => ({
      _id: p._id,
      name: p.name,
      category: p.category?.name || '-',
      brand: p.brand?.name || '-',
      image: p.images?.[0] || '',
      deletedAt: p.deleted_at?.toDateString(),
      initials: p.name?.charAt(0).toUpperCase(),
    }));
    res.json({ success: true, products: formatted });
  } catch (err) {
    res.json({ success: false });
  }
};

export const restoreProduct = async (req, res) => {
  try {
    const result = await Product.findByIdAndUpdate(
      req.params.id, 
      { $set: { deleted_at: null, status: 'active' } },  // use $set explicitly
      { new: true }
    );
    if (!result) return res.json({ success: false, message: 'Product not found' });
    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }
};

export const permanentDeleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;

    // Delete all variants (including trashed ones) belonging to this product
    await Variant.deleteMany({ product: productId });

    // Delete the product itself
    await Product.findByIdAndDelete(productId);

    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false, message: err.message });
  }
};

export const getProductDetail = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name')
      .populate('brand', 'name');
    if (!product) return res.redirect('/admin/products');

    // Find default variant (fallback to first active variant)
    let defaultVariant = null;
    if (product.defaultVariant) {
      defaultVariant = await Variant.findOne({ _id: product.defaultVariant, deleted_at: null });
    }
    if (!defaultVariant) {
      defaultVariant = await Variant.findOne({ product: product._id, deleted_at: null, isDefault: true });
    }
    if (!defaultVariant) {
      defaultVariant = await Variant.findOne({ product: product._id, deleted_at: null }).sort({ createdAt: 1 });
    }

    const categories = await Category.find({ deleted_at: null, is_visible: true });
    const brands = await Brand.find().sort({ name: 1 });

    const allProducts = await Product.find({ deleted_at: null })
      .populate('category', 'name')
      .populate('brand', 'name');
    const formatted = allProducts.map(p => {
      let stockStatus = 'IN_STOCK';
      if (p.stock === 0) stockStatus = 'OUT_OF_STOCK';
      else if (p.stock <= 10) stockStatus = 'LOW_STOCK';
      return {
        _id: p._id, name: p.name,
        category: p.category?.name || '-',
        brand: p.brand?.name || '-',
        price: p.price, stock: p.stock, stockStatus,
        status: p.status, images: p.images,
        sku: p.sku || '', initials: p.name?.charAt(0).toUpperCase(),
      };
    });

    // Merge: product info + default variant data
    const dvStock = defaultVariant?.stock ?? product.stock ?? 0;
    let stockStatus = 'IN_STOCK';
    if (dvStock === 0) stockStatus = 'OUT_OF_STOCK';
    else if (dvStock <= 10) stockStatus = 'LOW_STOCK';

    const selectedProduct = {
      _id: product._id,
      name: product.name,
      category: product.category?.name,
      brand: product.brand?.name,
      description: product.description,
      gender: product.gender,
      status: product.status,
      featured: product.featured,
      dealOfTheDay: product.dealOfTheDay,
      discount: product.discount,
      // from default variant
      price: defaultVariant?.price ?? product.price,
      stock: dvStock,
      stockStatus,
      sku: defaultVariant?.sku || product.sku || '',
      images: defaultVariant?.images?.length ? defaultVariant.images : product.images,
      offerProduct: defaultVariant?.offerProduct,
      strapColor: defaultVariant?.strapColor,
      dialColor: defaultVariant?.dialColor,
      caseColor: defaultVariant?.caseColor,
      size: defaultVariant?.size,
      strapMaterial: defaultVariant?.strapMaterial,
      caseMaterial: defaultVariant?.caseMaterial,
      variantStatus: defaultVariant?.status,
      variantName: defaultVariant?.name,
      defaultVariantId: defaultVariant?._id?.toString(),
    };

    const totalProducts = await Product.countDocuments({ deleted_at: null });
    const activeProducts = await Product.countDocuments({ deleted_at: null, status: 'active' });
    const inactiveProducts = await Product.countDocuments({ deleted_at: null, status: 'inactive' });
    const outOfStock = await Product.countDocuments({ deleted_at: null, stock: 0 });
    const trashCount = await Product.countDocuments({ deleted_at: { $ne: null } });

    res.render('admin/productManagement', {
      products: formatted,
      selectedProduct,
      categories,
      brands,
      currentPage: 1,
      totalPages: 1,
      search: '',
      sort: 'latest',
      status: 'all',
      category: 'all',
      brand: 'all',
      activePage: 'products',
      stats: { totalProducts, activeProducts, inactiveProducts, outOfStock, trashCount },
    });
  } catch (err) {
    console.log(err);
    res.redirect('/admin/products');
  }
};

export const setDefaultVariant = async (req, res) => {
  try {
    const { productId, variantId } = req.params;

    // Unset all current defaults for this product
    await Variant.updateMany({ product: productId }, { isDefault: false });

    // Set new default
    const variant = await Variant.findByIdAndUpdate(
      variantId,
      { isDefault: true },
      { new: true }
    );

    if (!variant) return res.json({ success: false, message: 'Variant not found.' });

    // Mirror default variant data onto product for list display
    await Product.findByIdAndUpdate(productId, {
      images: variant.images,
      price: variant.price,
      stock: variant.stock,
      defaultVariant: variant._id,
    });

    res.json({ success: true, message: 'Default variant updated.' });
  } catch (err) {
    console.log(err);
    res.json({ success: false, message: err.message });
  }
};

export const getVariants = async (req, res) => {
  try {
    const { productId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const query = { product: productId, deleted_at: null };
    const variants = await Variant.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    const total = await Variant.countDocuments(query);

    res.json({
      success: true,
      variants,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
      total,
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

export const addVariant = async (req, res) => {
  try {
    const { productId } = req.params;
    const {
  name, sku, strapColor, dialColor, caseColor,
  size, strapMaterial, caseMaterial, price, stock,
  status, offerProduct, existingImages
} = req.body;

     if (sku) {
      const existing = await Variant.findOne({ sku });
      if (existing) return res.json({ success: false, message: 'SKU already exists.' });
    }

    const uploadedImages = req.files ? req.files.map(f => f.path) : [];
    const existingArr = Array.isArray(existingImages) ? existingImages
      : existingImages ? [existingImages] : [];
    const allImages = [...existingArr, ...uploadedImages];

    if (allImages.length < 3) {
      return res.json({ success: false, message: 'At least 3 images are required.' });
    }

    const variant = await Variant.create({
  product: productId, name, sku, strapColor, dialColor, caseColor,
  size, strapMaterial, caseMaterial,
  price: parseFloat(price), stock: parseInt(stock) || 0,
  images: allImages,
  status: status || 'active',
  offerProduct: offerProduct === 'true' || offerProduct === true,
});

    res.json({ success: true, variant, message: 'Variant added.' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

export const editVariant = async (req, res) => {
  try {
    const { variantId } = req.params;
   const {
  name, sku, strapColor, dialColor, caseColor,
  size, strapMaterial, caseMaterial, price, stock,
  status, offerProduct, existingImages
} = req.body;

      if (sku) {
      const existing = await Variant.findOne({ sku, _id: { $ne: variantId } });
      if (existing) return res.json({ success: false, message: 'SKU already exists.' });
    }

    const uploadedImages = req.files ? req.files.map(f => f.path) : [];
    const existingArr = Array.isArray(existingImages) ? existingImages
      : existingImages ? [existingImages] : [];
    const allImages = [...existingArr, ...uploadedImages];

    if (allImages.length < 3) {
      return res.json({ success: false, message: 'At least 3 images are required.' });
    }

    const updated = await Variant.findByIdAndUpdate(variantId, {
  name, sku, strapColor, dialColor, caseColor,
  size, strapMaterial, caseMaterial,
  price: parseFloat(price), stock: parseInt(stock) || 0,
  images: allImages,
  status: status || 'active',
  offerProduct: offerProduct === 'true' || offerProduct === true,
}, { new: true });

    res.json({ success: true, variant: updated, message: 'Variant updated.' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

export const getVariantJson = async (req, res) => {
  try {
    const variant = await Variant.findById(req.params.variantId);
    if (!variant) return res.json({ success: false, message: 'Not found' });
    res.json({ success: true, variant });
  } catch (err) {
    res.json({ success: false });
  }
};

export const softDeleteVariant = async (req, res) => {
  try {
    const variant = await Variant.findById(req.params.variantId);
    if (!variant) return res.json({ success: false, message: 'Variant not found' });

    const wasDefault = variant.isDefault;
    
    // Soft delete it
    await Variant.findByIdAndUpdate(req.params.variantId, { 
      deleted_at: new Date(),
      isDefault: false 
    });

    // If it was default, promote next available variant
    if (wasDefault) {
      const nextVariant = await Variant.findOne({ 
        product: variant.product, 
        deleted_at: null,
        _id: { $ne: req.params.variantId }
      }).sort({ createdAt: 1 });

      if (nextVariant) {
        await Variant.findByIdAndUpdate(nextVariant._id, { isDefault: true });

        // Mirror new default onto product
        await Product.findByIdAndUpdate(variant.product, {
          images: nextVariant.images,
          price: nextVariant.price,
          stock: nextVariant.stock,
          defaultVariant: nextVariant._id,
        });
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false, message: err.message });
  }
};

export const getVariantTrash = async (req, res) => {
  try {
    const { productId } = req.params;
    const trashed = await Variant.find({ product: productId, deleted_at: { $ne: null } })
      .sort({ deleted_at: -1 });
    res.json({ success: true, variants: trashed });
  } catch (err) {
    res.json({ success: false });
  }
};

export const restoreVariant = async (req, res) => {
  try {
    const variant = await Variant.findById(req.params.variantId);
    if (!variant) return res.json({ success: false, message: 'Not found' });

    // Restore it (but NOT as default automatically)
    await Variant.findByIdAndUpdate(req.params.variantId, { 
      deleted_at: null,
      isDefault: false  // always restore as non-default
    });

    // Check if this product has any default variant at all
    const existingDefault = await Variant.findOne({ 
      product: variant.product, 
      deleted_at: null, 
      isDefault: true,
      _id: { $ne: req.params.variantId }
    });

    // If no default exists anywhere, make the restored one default
    if (!existingDefault) {
      await Variant.findByIdAndUpdate(req.params.variantId, { isDefault: true });
      await Product.findByIdAndUpdate(variant.product, {
        images: variant.images,
        price: variant.price,
        stock: variant.stock,
        defaultVariant: variant._id,
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false, message: err.message });
  }
};

export const permanentDeleteVariant = async (req, res) => {
  try {
    await Variant.findByIdAndDelete(req.params.variantId);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
};

export const getMaterials = async (req, res) => {
  try {
    const materials = await Material.find().sort({ name: 1 });
    res.json({ success: true, materials });
  } catch (err) {
    res.json({ success: false });
  }
};

export const addMaterial = async (req, res) => {
  try {
    const { name, type } = req.body;
    const existing = await Material.findOne({ name: { $regex: `^${name.trim()}$`, $options: 'i' } });
    if (existing) return res.json({ success: false, message: 'Material already exists.' });
    const material = await Material.create({ name: name.trim(), type: type || 'both' });
    res.json({ success: true, material });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

export const getSavedColors = async (req, res) => {
  try {
    const colors = await SavedColor.find().sort({ usedCount: -1 }).limit(30);
    res.json({ success: true, colors });
  } catch (err) {
    res.json({ success: false });
  }
};

export const saveColor = async (req, res) => {
  try {
    const { hex, name } = req.body;
    let color = await SavedColor.findOne({ hex: hex.toUpperCase() });
    if (color) {
      color.usedCount += 1;
      if (name) color.name = name;
      await color.save();
    } else {
      color = await SavedColor.create({ hex: hex.toUpperCase(), name: name || '' });
    }
    res.json({ success: true, color });
  } catch (err) {
    res.json({ success: false });
  }
};

export const generateProductSku = async (req, res) => {
  try {
    const { brand, model, collection } = req.query;
    const b = (brand || '').replace(/\s+/g, '').toUpperCase().slice(0, 3);
    const m = (model || '').replace(/\s+/g, '').toUpperCase().slice(0, 4);
    const c = (collection || '').replace(/\s+/g, '').toUpperCase().slice(0, 3);
    let base = [b, m, c].filter(Boolean).join('-');
    if (!base) return res.json({ success: false, message: 'Provide at least brand/model' });

  
    let sku = base;
    let counter = 1;
    while (await Product.findOne({ sku })) {
      sku = `${base}-${String(counter).padStart(2, '0')}`;
      counter++;
    }
    res.json({ success: true, sku });
  } catch (err) {
    res.json({ success: false });
  }
};

export const generateVariantSku = async (req, res) => {
  try {
    const { brand, productName, category, strapMaterial, strapColor, caseColor, dialColor, size } = req.query;

    const short = (str, len) => (str || '').replace(/\s+/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, len);

    const base = [
      short(brand, 3),
      short(productName, 4),
      short(category, 3),
      short(strapMaterial, 3),
      short(strapColor, 3),
      short(caseColor, 3),
      short(dialColor, 3),
      short(size, 3),
    ].filter(Boolean).join('-');

    if (!base) return res.json({ success: false, message: 'Not enough data' });

    let sku = base;
    let counter = 1;
    while (await Variant.findOne({ sku })) {
      sku = `${base}-${String(counter).padStart(2, '0')}`;
      counter++;
    }
    res.json({ success: true, sku });
  } catch (err) {
    res.json({ success: false });
  }
};

