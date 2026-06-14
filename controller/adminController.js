import Admin from '../model/adminModel.js';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import User from '../model/userModel.js';
import Address from '../model/addressModel.js';
import bcrypt from 'bcryptjs';
import { generateAndSaveOtp } from '../services/otpService.js';
import Category from '../model/categoryModel.js';
import { v2 as cloudinary } from 'cloudinary';
import Product from '../model/productModel.js';
import Brand from '../model/brandModel.js';
import Variant from '../model/variantModel.js';
import Material from '../model/materialModel.js';
import SavedColor from '../model/savedColorModel.js';
import Order from '../model/orderModel.js';
import Settings from '../model/settingsModel.js';
import WalletTransaction from '../model/walletTransactionModel.js';
import Referral from '../model/referralModel.js';
import Notification from '../model/notificationModel.js';
import mongoose from 'mongoose';
import { calculateRefundAmount } from '../utils/refundCalculator.js';
// auth and user management

function calcDiscount(originalPrice, salePrice) {
  const op = parseFloat(originalPrice) || 0;
  const sp = parseFloat(salePrice) || 0;
  if (op <= 0) return 0;
  return Math.max(0, Math.round(((op - sp) / op) * 100));
}

const cleanSpaces = (str) =>
  typeof str === 'string' ? str.trim().replace(/\s+/g, ' ') : '';

const validateProductName = async (name, excludeProductId = null) => {
  const cleanName = cleanSpaces(name);
  if (!cleanName) return { valid: false, msg: 'Product name is required.' };
  if (cleanName.length < 3 || cleanName.length > 100)
    return {
      valid: false,
      msg: 'Product name must be between 3 and 100 characters.',
    };
  if (!/[a-zA-Z]/.test(cleanName))
    return {
      valid: false,
      msg: 'Product name must contain at least one alphabetic character.',
    };
  if (!/^[a-zA-Z0-9\s\&\'\(\)\-]+$/.test(cleanName))
    return {
      valid: false,
      msg: 'Product name cannot contain special characters.',
    };

  let query = {
    name: { $regex: new RegExp(`^${cleanName}$`, 'i') },
    deleted_at: null,
  };
  if (excludeProductId) query._id = { $ne: excludeProductId };
  const existing = await Product.findOne(query);
  if (existing)
    return { valid: false, msg: 'A product with this name already exists.' };

  return { valid: true, value: cleanName };
};

const validateDescription = (desc) => {
  const cleanDesc = cleanSpaces(desc);
  if (!cleanDesc) return { valid: false, msg: 'Description is required.' };
  if (cleanDesc.length < 20)
    return {
      valid: false,
      msg: 'Description must contain at least 20 characters.',
    };
  if (cleanDesc.length > 2000)
    return { valid: false, msg: 'Description cannot exceed 2000 characters.' };
  if (!/[a-zA-Z]/.test(cleanDesc))
    return { valid: false, msg: 'Description must contain meaningful text.' };
  return { valid: true, value: cleanDesc };
};

const validateCategoryBrand = async (categoryId, brandId, brandName) => {
  if (!categoryId)
    return { valid: false, msg: 'Please select a valid category.' };
  const category = await Category.findOne({
    _id: categoryId,
    is_visible: true,
    deleted_at: null,
  });
  if (!category)
    return { valid: false, msg: 'Please select a valid category.' };

  let finalBrandId = brandId;
  if (brandId === 'other') {
    if (!brandName || !brandName.trim())
      return { valid: false, msg: 'Please select a valid brand.' };
    const cleanBrand = cleanSpaces(brandName);
    const existingBrand = await Brand.findOne({
      name: { $regex: new RegExp(`^${cleanBrand}$`, 'i') },
    });
    if (existingBrand) finalBrandId = existingBrand._id;
  } else {
    if (!brandId) return { valid: false, msg: 'Please select a valid brand.' };
    const brand = await Brand.findById(brandId);
    if (!brand) return { valid: false, msg: 'Please select a valid brand.' };
  }
  return {
    valid: true,
    categoryId,
    finalBrandId,
    newBrandName: brandId === 'other' ? cleanSpaces(brandName) : null,
  };
};

const validateVariantInput = async (data, productId, variantId = null) => {
  const {
    variantName: _variantName,
    name: _name,
    sku,
    strapColor,
    dialColor,
    caseColor,
    size,
    strapMaterial,
    caseMaterial,
    originalPrice,
    salePrice,
    stock,
  } = data;
  const variantName = _variantName || _name;

  const cleanVariantName = cleanSpaces(variantName);
  if (!cleanVariantName)
    return { valid: false, msg: 'Variant name is required.' };
  if (cleanVariantName.length < 3 || cleanVariantName.length > 100)
    return {
      valid: false,
      msg: 'Variant name must be between 3 and 100 characters.',
    };
  if (!/[a-zA-Z]/.test(cleanVariantName))
    return {
      valid: false,
      msg: 'Variant name cannot contain only numbers or symbols.',
    };
  if (!/^[a-zA-Z0-9\s\&\'\(\)\-]+$/.test(cleanVariantName))
    return {
      valid: false,
      msg: 'Variant name cannot contain special characters.',
    };

  if (!sku) return { valid: false, msg: 'SKU is required.' };
  if (!/^[a-zA-Z0-9\-]+$/.test(sku))
    return { valid: false, msg: 'SKU contains invalid characters.' };
  let skuQuery = { sku: sku };
  if (variantId) skuQuery._id = { $ne: variantId };
  const existingSku = await Variant.findOne(skuQuery);
  if (existingSku) return { valid: false, msg: 'SKU already exists.' };

  const validateMaterial = (mat, fieldName) => {
    const clean = cleanSpaces(mat);
    if (!clean) return { valid: false, msg: `${fieldName} name is required.` };
    if (clean.length < 2 || clean.length > 50)
      return {
        valid: false,
        msg: `${fieldName} name must be between 2 and 50 characters.`,
      };
    if (!/[a-zA-Z]/.test(clean))
      return {
        valid: false,
        msg: `${fieldName} name must contain alphabetic characters.`,
      };
    return { valid: true, value: clean };
  };
  const strapMatCheck = validateMaterial(strapMaterial, 'Strap material');
  if (!strapMatCheck.valid) return strapMatCheck;
  const caseMatCheck = validateMaterial(caseMaterial, 'Case material');
  if (!caseMatCheck.valid) return caseMatCheck;

  const validateColor = (col, fieldName) => {
    const clean = cleanSpaces(col);
    if (!clean) return { valid: false, msg: `${fieldName} is required.` };
    if (
      !/^[a-zA-Z\s]+$/.test(clean) &&
      !/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(clean)
    )
      return {
        valid: false,
        msg: `${fieldName} must be a valid color name or hex code.`,
      };
    return { valid: true, value: clean };
  };
  const strapColorCheck = validateColor(strapColor, 'Strap color');
  if (!strapColorCheck.valid) return strapColorCheck;
  const dialColorCheck = validateColor(dialColor, 'Dial color');
  if (!dialColorCheck.valid) return dialColorCheck;
  const caseColorCheck = validateColor(caseColor, 'Case color');
  if (!caseColorCheck.valid) return caseColorCheck;

  const cleanSize = cleanSpaces(size);
  if (!cleanSize) return { valid: false, msg: 'Size is required.' };
  if (!/^\d+mm$/i.test(cleanSize))
    return {
      valid: false,
      msg: 'Please enter a valid watch size (e.g., 42mm).',
    };

  const mrp = parseFloat(originalPrice);
  if (isNaN(mrp) || mrp <= 0)
    return { valid: false, msg: 'MRP must be greater than zero.' };
  if (!/^\d+(\.\d{1,2})?$/.test(mrp.toString()))
    return {
      valid: false,
      msg: 'MRP can have a maximum of two decimal places.',
    };

  const sp = parseFloat(salePrice);
  if (isNaN(sp) || sp <= 0)
    return { valid: false, msg: 'Sale price must be greater than zero.' };
  if (!/^\d+(\.\d{1,2})?$/.test(sp.toString()))
    return {
      valid: false,
      msg: 'Sale price can have a maximum of two decimal places.',
    };
  if (sp > mrp)
    return { valid: false, msg: 'Sale price cannot be greater than MRP.' };

  const stockNum = parseFloat(stock);
  if (isNaN(stockNum) || stockNum < 0)
    return { valid: false, msg: 'Stock cannot be negative.' };
  if (!Number.isInteger(stockNum))
    return { valid: false, msg: 'Stock must be a whole number.' };

  let dupQuery = {
    product: productId,
    size: cleanSize,
    strapColor: strapColorCheck.value,
    dialColor: dialColorCheck.value,
    caseColor: caseColorCheck.value,
    strapMaterial: strapMatCheck.value,
    caseMaterial: caseMatCheck.value,
    deleted_at: null,
  };
  if (variantId) dupQuery._id = { $ne: variantId };
  if (productId) {
    const dupVariant = await Variant.findOne(dupQuery);
    if (dupVariant)
      return {
        valid: false,
        msg: 'A variant with the same size, colors, and materials already exists.',
      };
  }

  return {
    valid: true,
    values: {
      variantName: cleanVariantName,
      sku,
      strapColor: strapColorCheck.value,
      dialColor: dialColorCheck.value,
      caseColor: caseColorCheck.value,
      size: cleanSize,
      strapMaterial: strapMatCheck.value,
      caseMaterial: caseMatCheck.value,
      originalPrice: mrp,
      salePrice: sp,
      stock: stockNum,
    },
  };
};

const validateImages = (allImages) => {
  if (allImages.length < 3)
    return { valid: false, msg: 'Please upload at least 3 images.' };
  for (const img of allImages) {
    if (!/\.(jpg|jpeg|png|webp)$/i.test(img))
      return {
        valid: false,
        msg: 'Only JPG, JPEG, PNG, and WEBP images are allowed.',
      };
  }
  return { valid: true };
};

export const loadLogin = (req, res) => {
  res.render('admin/login', { layout: 'auth', layout: 'auth' });
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email, isAdmin: true });

    if (!admin) {
      return res.render('admin/login', {
        layout: 'auth',
        error: 'Invalid email or password',
        email: '',
      });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.render('admin/login', {
        layout: 'auth',
        error: 'Invalid email or password',
        email: '',
      });
    }
    req.session.admin = { id: admin._id };

    res.redirect('/admin/dashBoard');
  } catch (err) {
    console.log(err);
    res.render('admin/login', {
      layout: 'auth',
      error: 'Something went wrong',
    });
  }
};

export const loadDashboard = (req, res) => {
  res.render('admin/dashBoard', { layout: 'admin', activePage: 'dashboard' });
};

export const logout = (req, res) => {
  req.session.admin = null;
  res.redirect('/admin/login');
};

export const loadForgotPassword = (req, res) => {
  res.render('admin/forgotPassword', { layout: 'auth', layout: 'auth' });
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.render('admin/forgotPassword', {
        layout: 'auth',
        error: 'Email required',
      });
    }

    const admin = await Admin.findOne({ email, isAdmin: true });

    if (!admin) {
      return res.render('admin/forgotPassword', {
        layout: 'auth',
        error: 'Email not registered',
      });
    }

    req.session.resetEmail = email;

    await generateAndSaveOtp({ email, purpose: 'forgot_password' });

    await req.session.save();

    res.redirect('/admin/otp');
  } catch (err) {
    console.log(err);
    res.render('admin/forgotPassword', {
      layout: 'auth',
      error: 'Something went wrong',
    });
  }
};

export const resetAdminPassword = async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;

    const email = req.session.resetEmail;

    if (!email || !req.session.resetVerified) {
      return res.redirect('/admin/forgotPassword');
    }

    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.redirect('/admin/login');
    }

    if (!newPassword || !confirmPassword) {
      return res.render('admin/resetPassword', {
        layout: 'auth',
        error: 'All fields required',
      });
    }

    if (newPassword !== confirmPassword) {
      return res.render('admin/resetPassword', {
        layout: 'auth',
        error: 'Passwords do not match',
      });
    }

    const isSame = await bcrypt.compare(newPassword, admin.password);

    if (isSame) {
      return res.render('admin/resetPassword', {
        layout: 'auth',
        error: 'New password must be different from old password',
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    admin.password = hashedPassword;
    await admin.save();

    req.session.resetEmail = null;

    req.session.resetVerified = null;

    res.redirect('/admin/login');
  } catch (err) {
    console.log(err);
    res.render('admin/resetPassword', {
      layout: 'auth',
      error: 'Something went wrong',
    });
  }
};

export const loadUsers = async (req, res) => {
  try {
    const search = req.query.search || '';
    const sortOption = req.query.sort || 'latest';
    const statusFilter = req.query.status || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;

    const query = {
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ],
    };

    if (statusFilter === 'blocked') {
      query.isBlocked = true;
    } else if (statusFilter === 'active') {
      query.isBlocked = false;
    }

    let sortQuery = {};

    if (sortOption === 'latest') {
      sortQuery = { createdAt: -1 };
    } else if (sortOption === 'oldest') {
      sortQuery = { createdAt: 1 };
    }

    const users = await User.find(query)
      .sort(sortQuery)
      .skip(skip)
      .limit(limit);

    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isBlocked: false });
    const blockedUsers = await User.countDocuments({ isBlocked: true });

    const totalPages = Math.ceil(totalUsers / limit);

    const totalSpendingAgg = await Order.aggregate([
      {
        $match: {
          paymentStatus: { $ne: 'Failed' },
          orderStatus: { $ne: 'Payment Pending' },
        },
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    const totalCustomerSpending = totalSpendingAgg[0]
      ? totalSpendingAgg[0].total
      : 0;

    // Fetch order stats per user
    const userIds = users.map((u) => u._id);
    const orderStats = await Order.aggregate([
      {
        $match: {
          userId: { $in: userIds },
          paymentStatus: { $ne: 'Failed' },
          orderStatus: { $ne: 'Payment Pending' },
        },
      },
      {
        $group: {
          _id: '$userId',
          totalOrders: { $sum: 1 },
          totalSpending: { $sum: '$totalAmount' },
        },
      },
    ]);
    const statsMap = {};
    orderStats.forEach((s) => {
      statsMap[s._id.toString()] = s;
    });

    const formattedUsers = users.map((u) => {
      const os = statsMap[u._id.toString()] || {
        totalOrders: 0,
        totalSpending: 0,
      };
      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        phone: u.phone || '-',
        avatar: u.avatar || null,
        initials: u.name?.charAt(0).toUpperCase() || 'U',
        status: u.isBlocked ? 'blocked' : 'active',
        joined: u.createdAt?.toDateString(),
        totalOrders: os.totalOrders,
        totalSpending: os.totalSpending,
      };
    });

    res.render('admin/usermanagement', {
      layout: 'admin',
      users: formattedUsers,
      currentPage: page,
      totalPages,
      search,
      sort: sortOption,
      activePage: 'users',
      stats: {
        totalUsers,
        activeUsers,
        blockedUsers,
        totalCustomerSpending,
      },
    });
  } catch (err) {
    console.log(err);
    res.redirect('/admin/dashBoard');
  }
};

//  EXPORT USERS PDF
export const exportUsersPdf = async (req, res) => {
  try {
    const search = req.query.search || '';
    const sortOption = req.query.sort || 'latest';
    const statusFilter = req.query.status || 'all';

    const query = {
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ],
    };
    if (statusFilter === 'blocked') query.isBlocked = true;
    else if (statusFilter === 'active') query.isBlocked = false;

    let sortQuery =
      sortOption === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };

    const users = await User.find(query).sort(sortQuery).lean();
    const userIds = users.map((u) => u._id);
    const orderStats = await Order.aggregate([
      {
        $match: {
          userId: { $in: userIds },
          paymentStatus: { $ne: 'Failed' },
          orderStatus: { $ne: 'Payment Pending' },
        },
      },
      {
        $group: {
          _id: '$userId',
          totalOrders: { $sum: 1 },
          totalSpending: { $sum: '$totalAmount' },
        },
      },
    ]);
    const statsMap = {};
    orderStats.forEach((s) => {
      statsMap[s._id.toString()] = s;
    });

    const doc = new PDFDocument({
      margin: 30,
      size: 'A4',
      layout: 'landscape',
    });
    res.setHeader(
      'Content-disposition',
      'attachment; filename=users_export.pdf'
    );
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);

    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('User Management Report', { align: 'center' });
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    if (search) doc.text(`Search: "${search}"`, { align: 'center' });
    if (statusFilter !== 'all')
      doc.text(`Status: ${statusFilter}`, { align: 'center' });
    doc.moveDown(1.5);

    const cols = [30, 180, 370, 470, 530, 600, 680];
    const headers = [
      'Name',
      'Email',
      'Phone',
      'Orders',
      'Spending',
      'Status',
      'Joined',
    ];
    doc.fontSize(9).font('Helvetica-Bold');
    headers.forEach((h, i) =>
      doc.text(h, cols[i], doc.y, { continued: i < headers.length - 1 })
    );
    doc.text('');
    doc
      .moveTo(30, doc.y + 3)
      .lineTo(790, doc.y + 3)
      .stroke();
    doc.moveDown(0.5);

    doc.font('Helvetica').fontSize(8);
    users.forEach((u) => {
      if (doc.y > 530) doc.addPage();
      const os = statsMap[u._id.toString()] || {
        totalOrders: 0,
        totalSpending: 0,
      };
      const y = doc.y;
      const name =
        u.name?.length > 20 ? u.name.substring(0, 18) + '...' : u.name || '-';
      const email =
        u.email?.length > 28
          ? u.email.substring(0, 26) + '...'
          : u.email || '-';
      doc.text(name, cols[0], y);
      doc.text(email, cols[1], y);
      doc.text(u.phone || '-', cols[2], y);
      doc.text(String(os.totalOrders), cols[3], y);
      doc.text(`Rs.${os.totalSpending.toFixed(0)}`, cols[4], y);
      doc.text(u.isBlocked ? 'Blocked' : 'Active', cols[5], y);
      doc.text(
        u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-',
        cols[6],
        y
      );
      doc.moveDown(1);
    });

    doc.end();
  } catch (err) {
    console.error('exportUsersPdf error:', err);
    res.status(500).send('Error generating PDF');
  }
};

// EXPORT USERS EXCEL
export const exportUsersExcel = async (req, res) => {
  try {
    const search = req.query.search || '';
    const sortOption = req.query.sort || 'latest';
    const statusFilter = req.query.status || 'all';

    const query = {
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ],
    };
    if (statusFilter === 'blocked') query.isBlocked = true;
    else if (statusFilter === 'active') query.isBlocked = false;

    let sortQuery =
      sortOption === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };

    const users = await User.find(query).sort(sortQuery).lean();
    const userIds = users.map((u) => u._id);
    const orderStats = await Order.aggregate([
      {
        $match: {
          userId: { $in: userIds },
          paymentStatus: { $ne: 'Failed' },
          orderStatus: { $ne: 'Payment Pending' },
        },
      },
      {
        $group: {
          _id: '$userId',
          totalOrders: { $sum: 1 },
          totalSpending: { $sum: '$totalAmount' },
        },
      },
    ]);
    const statsMap = {};
    orderStats.forEach((s) => {
      statsMap[s._id.toString()] = s;
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Users');
    sheet.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 35 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Orders', key: 'orders', width: 10 },
      { header: 'Spending (Rs)', key: 'spending', width: 18 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Joined', key: 'joined', width: 18 },
    ];
    sheet.getRow(1).font = { bold: true };

    users.forEach((u) => {
      const os = statsMap[u._id.toString()] || {
        totalOrders: 0,
        totalSpending: 0,
      };
      sheet.addRow({
        name: u.name || '-',
        email: u.email || '-',
        phone: u.phone || '-',
        orders: os.totalOrders,
        spending: os.totalSpending,
        status: u.isBlocked ? 'Blocked' : 'Active',
        joined: u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-',
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=users_export.xlsx'
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportUsersExcel error:', err);
    res.status(500).send('Error generating Excel');
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
      phone: u.phone || '-',
      avatar: u.avatar || null,
      initials: u.name?.charAt(0).toUpperCase() || 'U',
      status: u.isBlocked ? 'blocked' : 'active',
      joined: u.createdAt?.toDateString(),
    }));

    const user = await User.findById(userId);
    if (!user) return res.redirect('/admin/users');

    const defaultAddress = await Address.findOne({ userId, isDefault: true });

    // Fetch order history for this user
    const orderHistory = await Order.find({
      userId: userId,
      paymentStatus: { $ne: 'Failed' },
      orderStatus: { $ne: 'Payment Pending' },
    })
      .sort({ createdAt: -1 })
      .lean();

    // Aggregate spending stats
    const spendingAgg = await Order.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          paymentStatus: { $ne: 'Failed' },
          orderStatus: { $ne: 'Payment Pending' },
        },
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSpending: { $sum: '$totalAmount' },
        },
      },
    ]);
    const spending = spendingAgg[0] || { totalOrders: 0, totalSpending: 0 };
    const avgOrder =
      spending.totalOrders > 0
        ? spending.totalSpending / spending.totalOrders
        : 0;

    // Format order history for the view
    const formattedOrders = orderHistory.map((order) => ({
      orderId: order.orderId || order._id.toString().slice(-8).toUpperCase(),
      orderDate:
        order.orderDate?.toDateString?.() || order.createdAt?.toDateString(),
      amount: order.totalAmount || 0,
      status: order.orderStatus || 'Pending',
    }));

    const selectedUser = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone || '-',
      address: defaultAddress
        ? `${defaultAddress.street}, ${defaultAddress.city}, ${defaultAddress.state}, ${defaultAddress.pincode}`
        : 'No default address',
      avatar: user.avatar,
      initials: user.name?.charAt(0).toUpperCase(),
      status: user.isBlocked ? 'blocked' : 'active',
      joined: user.createdAt?.toDateString(),
      totalOrders: spending.totalOrders,
      totalSpending: spending.totalSpending,
      avgOrder: Math.round(avgOrder),
      orders: formattedOrders,
    };

    res.render('admin/usermanagement', {
      layout: 'admin',
      users: formattedUsers,
      selectedUser,
      activePage: 'users',
    });
  } catch (error) {
    console.log(error);
    res.redirect('/admin/users');
  }
};

// category and product management

export const loadCategoryManagement = async (req, res) => {
  try {
    const search = req.query.search || '';
    const status = req.query.status || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;

    let query = {};
    if (status === 'trash') {
      query.deleted_at = { $ne: null };
    } else {
      query.deleted_at = null;
      if (status === 'visible') query.is_visible = true;
      if (status === 'hidden') query.is_visible = false;
    }
    if (search) query.name = { $regex: search, $options: 'i' };

    const categories = await Category.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);
    const total = await Category.countDocuments(query);
    const totalVisible = await Category.countDocuments({
      is_visible: true,
      deleted_at: null,
    });
    const totalHidden = await Category.countDocuments({
      is_visible: false,
      deleted_at: null,
    });
    const totalAll = await Category.countDocuments({ deleted_at: null });
    const totalTrashed = await Category.countDocuments({
      deleted_at: { $ne: null },
    });

    const productAgg = await Category.aggregate([
      { $match: { deleted_at: null } },
      { $group: { _id: null, total: { $sum: '$quantity_available' } } },
    ]);
    const totalProducts = productAgg[0]?.total || 0;

    const formatted = categories.map((c) => ({
      _id: c._id,
      name: c.name,
      description: c.short_description || '',
      productCount: c.quantity_available,
      isVisible: c.is_visible,
      image: c.image_url,
      isTrashed: !!c.deleted_at,
      deletedAt: c.deleted_at?.toDateString() || '',
    }));

    res.render('admin/categoryManagement', {
      layout: 'admin',
      activePage: 'categoryManagement',
      categories: formatted,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
      search,
      status,
      stats: {
        totalCategories: totalAll,
        visibleCount: totalVisible,
        hiddenCount: totalHidden,
        trashedCount: totalTrashed,
        totalProducts,
      },
    });
  } catch (err) {
    console.log(err);
    res.redirect('/admin/dashBoard');
  }
};

export const addCategory = async (req, res) => {
  try {
    const { name, description, quantity } = req.body;

    const existing = await Category.findOne({
      name: { $regex: `^${name.trim()}$`, $options: 'i' },
    });
    if (existing) {
      const msg = existing.deleted_at
        ? 'A deleted category with this name exists in trash. Restore it instead.'
        : 'Category name already exists.';
      return res.json({ success: false, message: msg });
    }

    const category = new Category({
      name: name.trim(),
      short_description: description || '',
      quantity_available: parseInt(quantity) || 0,
      image_url: req.file ? req.file.path : '',
      is_visible: true,
    });

    await category.save();

    res.json({
      success: true,
      category: {
        _id: category._id,
        name: category.name,
        short_description: category.short_description,
        image_url: category.image_url,
        quantity: category.quantity_available,
      },
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
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    const updateData = {
      name: name.trim(),
      short_description: description || '',
      slug,
      quantity_available: parseInt(quantity) || 0,
    };

    // Uniqueness validation (excluding current category)
    const existing = await Category.findOne({
      name: { $regex: `^${name.trim()}$`, $options: 'i' },
      _id: { $ne: req.params.id },
    });
    if (existing) {
      const msg = existing.deleted_at
        ? 'A deleted category with this name exists in trash. Restore it instead.'
        : 'Category name already exists.';
      return res.json({ success: false, message: msg });
    }

    if (req.file) {
      const existing = await Category.findById(req.params.id);
      if (existing?.image_url) {
        const publicId = existing.image_url
          .split('/')
          .slice(-2)
          .join('/')
          .replace(/\.[^.]+$/, '');
        try {
          await cloudinary.uploader.destroy(publicId);
        } catch (e) {
          console.log('Cloudinary delete err:', e);
        }
      }
      updateData.image_url = req.file.path;
    } else if (removeImage === 'true') {
      const existing = await Category.findById(req.params.id);
      if (existing?.image_url) {
        const publicId = existing.image_url
          .split('/')
          .slice(-2)
          .join('/')
          .replace(/\.[^.]+$/, '');
        try {
          await cloudinary.uploader.destroy(publicId);
        } catch (e) {
          console.log('Cloudinary delete err:', e);
        }
      }
      updateData.image_url = '';
    }

    const updated = await Category.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    res.json({
      success: true,
      image_url: updated.image_url || '',
      quantity: updated.quantity_available,
      name: updated.name,
      short_description: updated.short_description,
      slug: updated.slug,
    });
  } catch (err) {
    console.log('editCategory error:', err);
    res.json({ success: false, message: 'Failed to update category.' });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    await Category.findByIdAndUpdate(req.params.id, {
      deleted_at: new Date(),
      is_visible: false,
    });
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
      const publicId = cat.image_url
        .split('/')
        .slice(-2)
        .join('/')
        .replace(/\.[^.]+$/, '');
      try {
        await cloudinary.uploader.destroy(publicId);
      } catch (e) {
        console.log(e);
      }
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
      is_visible: true,
    });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: 'Failed to restore category.' });
  }
};

export const loadTrash = async (req, res) => {
  try {
    const trashed = await Category.find({ deleted_at: { $ne: null } }).sort({
      deleted_at: -1,
    });
    const formatted = trashed.map((c) => ({
      _id: c._id,
      name: c.name,
      description: c.short_description || '',
      image: c.image_url || '',
      deletedAt: c.deleted_at?.toDateString(),
    }));
    res.json({ success: true, categories: formatted });
  } catch (err) {
    res.json({ success: false, message: 'Failed to load trash.' });
  }
};

export const getCategoryStats = async (req, res) => {
  try {
    const total = await Category.countDocuments({ deleted_at: null });
    const visible = await Category.countDocuments({
      deleted_at: null,
      is_visible: true,
    });
    const hidden = await Category.countDocuments({
      deleted_at: null,
      is_visible: false,
    });
    const trashed = await Category.countDocuments({
      deleted_at: { $ne: null },
    });
    const productAgg = await Category.aggregate([
      { $match: { deleted_at: null } },
      { $group: { _id: null, total: { $sum: '$quantity_available' } } },
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
        deleted_at: null,
      }).distinct('product');

      const brandMatches = await Brand.find({
        name: { $regex: search, $options: 'i' },
      });
      const brandIds = brandMatches.map((b) => b._id);

      const orClauses = [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { brand: { $in: brandIds } },
        { _id: { $in: variantsBySkuSearch } },
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
    const activeProducts = await Product.countDocuments({
      deleted_at: null,
      status: 'active',
    });
    const inactiveProducts = await Product.countDocuments({
      deleted_at: null,
      status: 'inactive',
    });
    const outOfStock = await Product.countDocuments({
      deleted_at: null,
      stock: 0,
    });
    const trashCount = await Product.countDocuments({
      deleted_at: { $ne: null },
    });

    const categories = await Category.find({
      deleted_at: null,
      is_visible: true,
    });
    const brands = await Brand.find().sort({ name: 1 });

    const formatted = products.map((p) => {
      let stockStatus = 'IN_STOCK';
      if (p.stock === 0) stockStatus = 'OUT_OF_STOCK';
      else if (p.stock <= 10) stockStatus = 'LOW_STOCK';

      return {
        _id: p._id,
        name: p.name,
        category: p.category?.name || '-',
        brand: p.brand?.name || '-',
        originalPrice: p.originalPrice ?? p.price ?? 0,
        salePrice: p.salePrice ?? p.price ?? 0,
        discountPercentage: p.discountPercentage ?? p.discount ?? 0,
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
      layout: 'admin',
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
    res.redirect('/admin/dashBoard');
  }
};

export const addProduct = async (req, res) => {
  try {
    const {
      name,
      category,
      brand,
      newBrand,
      description,
      gender,
      status,
      featured,
      dealOfTheDay,
      // default variant fields
      variantName,
      sku,
      strapColor,
      dialColor,
      caseColor,
      size,
      strapMaterial,
      caseMaterial,
      originalPrice,
      salePrice,
      stock,
      offerProduct,
      existingImages,
    } = req.body;

    const nameCheck = await validateProductName(name);
    if (!nameCheck.valid)
      return res.json({ success: false, message: nameCheck.msg });

    const descCheck = validateDescription(description);
    if (!descCheck.valid)
      return res.json({ success: false, message: descCheck.msg });

    const catBrandCheck = await validateCategoryBrand(
      category,
      brand,
      newBrand
    );
    if (!catBrandCheck.valid)
      return res.json({ success: false, message: catBrandCheck.msg });

    const variantCheck = await validateVariantInput(req.body, null, null);
    if (!variantCheck.valid)
      return res.json({ success: false, message: variantCheck.msg });

    const uploadedImages = req.files ? req.files.map((f) => f.path) : [];
    const existingArr = Array.isArray(existingImages)
      ? existingImages
      : existingImages
        ? [existingImages]
        : [];
    const allImages = [...existingArr, ...uploadedImages];
    const imageCheck = validateImages(allImages);
    if (!imageCheck.valid)
      return res.json({ success: false, message: imageCheck.msg });

    let brandId = catBrandCheck.finalBrandId;
    if (catBrandCheck.newBrandName && brand === 'other') {
      let existing = await Brand.findOne({
        name: { $regex: new RegExp(`^${catBrandCheck.newBrandName}$`, 'i') },
      });
      if (!existing)
        existing = await Brand.create({ name: catBrandCheck.newBrandName });
      brandId = existing._id;
    }

    const vVals = variantCheck.values;
    const discountPct = calcDiscount(vVals.originalPrice, vVals.salePrice);

    // Create product
    const product = new Product({
      name: nameCheck.value,
      category: catBrandCheck.categoryId,
      brand: brandId,
      description: descCheck.value,
      gender: gender || 'unisex',
      images: allImages,
      status: status || 'active',
      featured: featured === 'true' || featured === true,
      dealOfTheDay: dealOfTheDay === 'true' || dealOfTheDay === true,
      originalPrice: vVals.originalPrice,
      salePrice: vVals.salePrice,
      discountPercentage: discountPct,
      price: parseFloat(salePrice) || 0,
      discount: discountPct,
      stock: parseInt(stock) || 0,
    });
    await product.save();

    // Create default variant
    const variant = await Variant.create({
      product: product._id,
      name: variantName?.trim() || name.trim(),
      sku: sku || undefined,
      strapColor,
      dialColor,
      caseColor,
      size,
      strapMaterial,
      caseMaterial,
      originalPrice: parseFloat(originalPrice),
      salePrice: parseFloat(salePrice),
      discountPercentage: discountPct,
      price: parseFloat(salePrice),
      stock: parseInt(stock) || 0,
      images: allImages,
      status: status || 'active',
      offerProduct: offerProduct === 'true' || offerProduct === true,
      isDefault: true,
    });

    product.defaultVariant = variant._id;

    product.originalPrice = variant.originalPrice;
    product.salePrice = variant.salePrice;
    product.discountPercentage = variant.discountPercentage;
    product.price = variant.salePrice;
    product.discount = variant.discountPercentage;
    await product.save();

    res.json({
      success: true,
      message: 'Product and default variant created successfully.',
      productId: product._id,
    });
  } catch (err) {
    console.log(err);
    res.json({
      success: false,
      message: err.message || 'Failed to add product.',
    });
  }
};

export const editProduct = async (req, res) => {
  try {
    const {
      name,
      category,
      brand,
      newBrand,
      description,
      gender,
      status,
      featured,
      dealOfTheDay,
    } = req.body;

    const currentProduct = await Product.findById(req.params.id);
    if (!currentProduct)
      return res.json({ success: false, message: 'Product not found.' });

    const nameCheck = await validateProductName(name, req.params.id);
    if (!nameCheck.valid)
      return res.json({ success: false, message: nameCheck.msg });

    const descCheck = validateDescription(description);
    if (!descCheck.valid)
      return res.json({ success: false, message: descCheck.msg });

    const catBrandCheck = await validateCategoryBrand(
      category,
      brand,
      newBrand
    );
    if (!catBrandCheck.valid)
      return res.json({ success: false, message: catBrandCheck.msg });

    let brandId = catBrandCheck.finalBrandId;
    if (catBrandCheck.newBrandName && brand === 'other') {
      let existing = await Brand.findOne({
        name: { $regex: new RegExp(`^${catBrandCheck.newBrandName}$`, 'i') },
      });
      if (!existing)
        existing = await Brand.create({ name: catBrandCheck.newBrandName });
      brandId = existing._id;
    }

    const wasActive = currentProduct.status === 'active';
    const goingActive = status === 'active';
    const goingInactive = status === 'inactive';

    if (wasActive && goingInactive) {
      const variants = await Variant.find({
        product: req.params.id,
        deleted_at: null,
      });
      for (const v of variants) {
        await Variant.findByIdAndUpdate(v._id, {
          variantStatusBeforeInactive: v.status,
          status: 'inactive',
        });
      }
    }

    if (!wasActive && goingActive) {
      const variants = await Variant.find({
        product: req.params.id,
        deleted_at: null,
      });
      for (const v of variants) {
        const restoreStatus = v.variantStatusBeforeInactive || 'active';
        await Variant.findByIdAndUpdate(v._id, {
          status: restoreStatus,
          variantStatusBeforeInactive: null,
        });
      }
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
      defaultVariant = await Variant.findOne({
        _id: product.defaultVariant,
        deleted_at: null,
      });
    }
    if (!defaultVariant) {
      defaultVariant = await Variant.findOne({
        product: product._id,
        isDefault: true,
        deleted_at: null,
      });
    }

    res.json({
      _id: product._id,
      name: product.name,
      categoryId: product.category?._id,
      brandId: product.brand?._id,
      description: product.description,
      gender: product.gender,
      images: defaultVariant?.images?.length
        ? defaultVariant.images
        : product.images,
      status: product.status,
      featured: product.featured,
      dealOfTheDay: product.dealOfTheDay,
      originalPrice:
        defaultVariant?.originalPrice ?? product.originalPrice ?? 0,
      salePrice: defaultVariant?.salePrice ?? product.salePrice ?? 0,
      discountPercentage:
        defaultVariant?.discountPercentage ?? product.discountPercentage ?? 0,
      discount: defaultVariant?.discountPercentage ?? product.discount ?? 0,
      price: defaultVariant?.salePrice ?? product.salePrice ?? 0,
      stock: defaultVariant?.stock ?? product.stock,
      sku: defaultVariant?.sku || product.sku || '',
      offerProduct: defaultVariant?.offerProduct || false,
    });
  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }
};

export const softDeleteProduct = async (req, res) => {
  try {
    await Product.findByIdAndUpdate(req.params.id, {
      deleted_at: new Date(),
      status: 'inactive',
    });
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
    const formatted = trashed.map((p) => ({
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
      { $set: { deleted_at: null, status: 'active' } },
      { new: true }
    );
    if (!result)
      return res.json({ success: false, message: 'Product not found' });
    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }
};

export const permanentDeleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;

    await Variant.deleteMany({ product: productId });

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

    let defaultVariant = null;
    if (product.defaultVariant) {
      defaultVariant = await Variant.findOne({
        _id: product.defaultVariant,
        deleted_at: null,
      });
    }
    if (!defaultVariant) {
      defaultVariant = await Variant.findOne({
        product: product._id,
        deleted_at: null,
        isDefault: true,
      });
    }
    if (!defaultVariant) {
      defaultVariant = await Variant.findOne({
        product: product._id,
        deleted_at: null,
      }).sort({ createdAt: 1 });
    }

    const categories = await Category.find({
      deleted_at: null,
      is_visible: true,
    });
    const brands = await Brand.find().sort({ name: 1 });

    const allProducts = await Product.find({ deleted_at: null })
      .populate('category', 'name')
      .populate('brand', 'name');
    const formatted = allProducts.map((p) => {
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

      originalPrice:
        defaultVariant?.originalPrice ?? product.originalPrice ?? 0,
      salePrice: defaultVariant?.salePrice ?? product.salePrice ?? 0,
      discountPercentage:
        defaultVariant?.discountPercentage ?? product.discountPercentage ?? 0,
      price: defaultVariant?.salePrice ?? product.salePrice ?? 0, // legacy
      stock: dvStock,
      stockStatus,
      sku: defaultVariant?.sku || product.sku || '',
      images: defaultVariant?.images?.length
        ? defaultVariant.images
        : product.images,
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
    const activeProducts = await Product.countDocuments({
      deleted_at: null,
      status: 'active',
    });
    const inactiveProducts = await Product.countDocuments({
      deleted_at: null,
      status: 'inactive',
    });
    const outOfStock = await Product.countDocuments({
      deleted_at: null,
      stock: 0,
    });
    const trashCount = await Product.countDocuments({
      deleted_at: { $ne: null },
    });

    res.render('admin/productManagement', {
      layout: 'admin',
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
    res.redirect('/admin/products');
  }
};

export const setDefaultVariant = async (req, res) => {
  try {
    const { productId, variantId } = req.params;

    await Variant.updateMany({ product: productId }, { isDefault: false });

    const variant = await Variant.findByIdAndUpdate(
      variantId,
      { isDefault: true },
      { new: true }
    );

    if (!variant)
      return res.json({ success: false, message: 'Variant not found.' });

    await Product.findByIdAndUpdate(productId, {
      images: variant.images,
      originalPrice: variant.originalPrice,
      salePrice: variant.salePrice,
      discountPercentage: variant.discountPercentage,
      price: variant.salePrice,
      discount: variant.discountPercentage,
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
    const variants = await Variant.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
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
      name,
      sku,
      strapColor,
      dialColor,
      caseColor,
      size,
      strapMaterial,
      caseMaterial,
      originalPrice,
      salePrice,
      stock,
      status,
      offerProduct,
      existingImages,
    } = req.body;

    const variantCheck = await validateVariantInput(req.body, productId, null);
    if (!variantCheck.valid)
      return res.json({ success: false, message: variantCheck.msg });

    const uploadedImages = req.files ? req.files.map((f) => f.path) : [];
    const existingArr = Array.isArray(existingImages)
      ? existingImages
      : existingImages
        ? [existingImages]
        : [];
    const allImages = [...existingArr, ...uploadedImages];
    const imageCheck = validateImages(allImages);
    if (!imageCheck.valid)
      return res.json({ success: false, message: imageCheck.msg });

    const existingDefault = await Variant.findOne({
      product: productId,
      isDefault: true,
      deleted_at: null,
    });
    const shouldBeDefault = !existingDefault;

    const vVals = variantCheck.values;
    const discountPct = calcDiscount(vVals.originalPrice, vVals.salePrice);

    const variant = await Variant.create({
      product: productId,
      name: vVals.variantName,
      sku: vVals.sku || undefined,
      strapColor: vVals.strapColor,
      dialColor: vVals.dialColor,
      caseColor: vVals.caseColor,
      size: vVals.size,
      strapMaterial: vVals.strapMaterial,
      caseMaterial: vVals.caseMaterial,
      originalPrice: vVals.originalPrice,
      salePrice: vVals.salePrice,
      discountPercentage: discountPct,
      price: parseFloat(salePrice),
      stock: parseInt(stock) || 0,
      images: allImages,
      status: status || 'active',
      offerProduct: offerProduct === 'true' || offerProduct === true,
      isDefault: shouldBeDefault,
    });

    if (shouldBeDefault) {
      await Product.findByIdAndUpdate(productId, {
        images: allImages,
        originalPrice: variant.originalPrice,
        salePrice: variant.salePrice,
        discountPercentage: variant.discountPercentage,
        price: variant.salePrice,
        discount: variant.discountPercentage,
        stock: variant.stock,
        defaultVariant: variant._id,
      });
    }

    res.json({ success: true, variant, message: 'Variant added.' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

export const editVariant = async (req, res) => {
  try {
    const { variantId } = req.params;
    const {
      name,
      sku,
      strapColor,
      dialColor,
      caseColor,
      size,
      strapMaterial,
      caseMaterial,
      originalPrice,
      salePrice,
      stock,
      status,
      offerProduct,
      existingImages,
    } = req.body;

    const existingVariant = await Variant.findById(variantId);
    if (!existingVariant)
      return res.json({ success: false, message: 'Variant not found.' });

    const variantCheck = await validateVariantInput(
      req.body,
      existingVariant.product,
      variantId
    );
    if (!variantCheck.valid)
      return res.json({ success: false, message: variantCheck.msg });

    const uploadedImages = req.files ? req.files.map((f) => f.path) : [];
    const existingArr = Array.isArray(existingImages)
      ? existingImages
      : existingImages
        ? [existingImages]
        : [];
    const allImages = [...existingArr, ...uploadedImages];
    const imageCheck = validateImages(allImages);
    if (!imageCheck.valid)
      return res.json({ success: false, message: imageCheck.msg });

    const vVals = variantCheck.values;
    const discountPct = calcDiscount(vVals.originalPrice, vVals.salePrice);

    const updated = await Variant.findByIdAndUpdate(
      variantId,
      {
        $set: {
          name: vVals.variantName,
          sku: vVals.sku || undefined,
          strapColor: vVals.strapColor,
          dialColor: vVals.dialColor,
          caseColor: vVals.caseColor,
          size: vVals.size,
          strapMaterial: vVals.strapMaterial,
          caseMaterial: vVals.caseMaterial,
          originalPrice: vVals.originalPrice,
          salePrice: vVals.salePrice,
          discountPercentage: discountPct,
          price: vVals.salePrice,
          stock: vVals.stock,
          images: allImages,
          status: status || 'active',
          offerProduct: offerProduct === 'true' || offerProduct === true,
        },
      },
      { new: true, runValidators: false }
    );

    if (updated.isDefault) {
      await Product.findByIdAndUpdate(updated.product, {
        images: allImages,
        originalPrice: updated.originalPrice,
        salePrice: updated.salePrice,
        discountPercentage: updated.discountPercentage,
        price: updated.salePrice,
        discount: updated.discountPercentage,
        stock: updated.stock,
      });
    }

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
    if (!variant)
      return res.json({ success: false, message: 'Variant not found' });

    const wasDefault = variant.isDefault;

    await Variant.findByIdAndUpdate(req.params.variantId, {
      deleted_at: new Date(),
      isDefault: false,
    });

    if (wasDefault) {
      const nextVariant = await Variant.findOne({
        product: variant.product,
        deleted_at: null,
        _id: { $ne: req.params.variantId },
      }).sort({ createdAt: 1 });

      if (nextVariant) {
        await Variant.findByIdAndUpdate(nextVariant._id, { isDefault: true });
        await Product.findByIdAndUpdate(variant.product, {
          images: nextVariant.images,
          originalPrice: nextVariant.originalPrice,
          salePrice: nextVariant.salePrice,
          discountPercentage: nextVariant.discountPercentage,
          price: nextVariant.salePrice,
          discount: nextVariant.discountPercentage,
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
    const trashed = await Variant.find({
      product: productId,
      deleted_at: { $ne: null },
    }).sort({ deleted_at: -1 });
    res.json({ success: true, variants: trashed });
  } catch (err) {
    res.json({ success: false });
  }
};

export const restoreVariant = async (req, res) => {
  try {
    const variant = await Variant.findById(req.params.variantId);
    if (!variant) return res.json({ success: false, message: 'Not found' });

    await Variant.findByIdAndUpdate(req.params.variantId, {
      deleted_at: null,
      isDefault: false,
    });

    const existingDefault = await Variant.findOne({
      product: variant.product,
      deleted_at: null,
      isDefault: true,
      _id: { $ne: req.params.variantId },
    });

    if (!existingDefault) {
      await Variant.findByIdAndUpdate(req.params.variantId, {
        isDefault: true,
      });
      await Product.findByIdAndUpdate(variant.product, {
        images: variant.images,
        originalPrice: variant.originalPrice,
        salePrice: variant.salePrice,
        discountPercentage: variant.discountPercentage,
        price: variant.salePrice,
        discount: variant.discountPercentage,
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
    const existing = await Material.findOne({
      name: { $regex: `^${name.trim()}$`, $options: 'i' },
    });
    if (existing)
      return res.json({ success: false, message: 'Material already exists.' });
    const material = await Material.create({
      name: name.trim(),
      type: type || 'both',
    });
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
      color = await SavedColor.create({
        hex: hex.toUpperCase(),
        name: name || '',
      });
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
    if (!base)
      return res.json({
        success: false,
        message: 'Provide at least brand/model',
      });

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
    const {
      brand,
      productName,
      category,
      strapMaterial,
      strapColor,
      caseColor,
      dialColor,
      size,
    } = req.query;

    const short = (str, len) =>
      (str || '')
        .replace(/\s+/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, len);

    const base = [
      short(brand, 3),
      short(productName, 4),
      short(category, 3),
      short(strapMaterial, 3),
      short(strapColor, 3),
      short(caseColor, 3),
      short(dialColor, 3),
      short(size, 3),
    ]
      .filter(Boolean)
      .join('-');

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

// ADMIN ORDER MANAGEMENT

const STATUS_FLOW = [
  'Pending',
  'Confirmed',
  'Packed',
  'Quality Checked',
  'Shipped',
  'Out for Delivery',
  'Delivered',
  'Return Requested',
  'Return Approved',
  'Pickup Scheduled',
  'Return Picked',
  'Refund Processed',
  'Return Rejected',
  'Returned',
];

const FINALIZED_STATUSES = [
  'Cancelled',
  'Delivered',
  'Refund Processed',
  'Return Rejected',
  'Returned',
];

function getNextAllowedStatus(currentStatus) {
  const forwardChain = [
    'Pending',
    'Confirmed',
    'Packed',
    'Shipped',
    'Out for Delivery',
    'Delivered',
  ];
  const idx = forwardChain.indexOf(currentStatus);
  if (idx === -1 || idx === forwardChain.length - 1) return null;
  return forwardChain[idx + 1];
}

// Validation map: each status that CAN be set must be preceded by exactly these statuses
const REQUIRED_PREV_STATUS = {
  Confirmed: ['Pending'],
  Packed: ['Confirmed'],
  Shipped: ['Packed'],
  'Out for Delivery': ['Shipped'],
  Delivered: ['Out for Delivery'],
};

export const loadAdminOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const sort = req.query.sort || 'latest';
    const statusFilter = req.query.status || 'all';
    const paymentFilter = req.query.payment || 'all';

    let query = {
      $and: [
        { paymentStatus: { $ne: 'Failed' } },
        { orderStatus: { $ne: 'Payment Pending' } },
      ],
    };
    if (search) {
      query.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { 'products.productName': { $regex: search, $options: 'i' } },
      ];
    }
    if (paymentFilter !== 'all') query.paymentMethod = paymentFilter;
    if (statusFilter !== 'all') query['products.orderStatus'] = statusFilter;

    let sortQuery = { createdAt: -1 };
    if (sort === 'oldest') sortQuery = { createdAt: 1 };
    else if (sort === 'amount_high') sortQuery = { totalAmount: -1 };
    else if (sort === 'amount_low') sortQuery = { totalAmount: 1 };

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit) || 1;

    const orders = await Order.find(query)
      .sort(sortQuery)
      .skip(skip)
      .limit(limit)
      .populate('userId', 'image email avatar')
      .lean();

    const fmtDate = (d) =>
      d
        ? new Date(d).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : '-';

    const formatted = orders.map((o) => {
      const statuses = o.products.map((p) => p.orderStatus);
      const uniqueStatuses = [...new Set(statuses)];
      let summaryStatus = o.orderStatus; // fallback
      let hasMixedStatus = false;
      let mixedStatuses = [];

      if (uniqueStatuses.length > 1) {
        hasMixedStatus = true;
        const counts = {};
        statuses.forEach((s) => (counts[s] = (counts[s] || 0) + 1));
        mixedStatuses = Object.keys(counts).map((k) => ({
          status: k,
          count: counts[k],
        }));
      } else if (uniqueStatuses.length === 1) {
        summaryStatus = uniqueStatuses[0];
      }

      return {
        ...o,
        orderDateFormatted: fmtDate(o.orderDate),
        customerName: o.shippingAddress?.fullName || '-',
        customerEmail: o.userId?.email || '-',
        userImage:
          o.userId?.avatar || o.userId?.image || '/image/useravathar.png',
        productCount: o.products?.length || 0,
        summaryStatus,
        hasMixedStatus,
        mixedStatuses,
      };
    });

    const totalRevenue = await Order.aggregate([
      {
        $match: {
          orderStatus: { $nin: ['Cancelled', 'Payment Pending'] },
          paymentStatus: { $ne: 'Failed' },
        },
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);

    const pendingCount = await Order.countDocuments({
      'products.orderStatus': 'Pending',
      paymentStatus: { $ne: 'Failed' },
      orderStatus: { $ne: 'Payment Pending' },
    });
    const deliveredCount = await Order.countDocuments({
      'products.orderStatus': 'Delivered',
      paymentStatus: { $ne: 'Failed' },
      orderStatus: { $ne: 'Payment Pending' },
    });
    const cancelledCount = await Order.countDocuments({
      'products.orderStatus': 'Cancelled',
      paymentStatus: { $ne: 'Failed' },
      orderStatus: { $ne: 'Payment Pending' },
    });

    res.render('admin/orderManagement', {
      layout: 'admin',
      activePage: 'orders',
      orders: formatted,
      currentPage: page,
      totalPages,
      search,
      sort,
      status: statusFilter,
      payment: paymentFilter,
      stats: {
        totalOrders: await Order.countDocuments({
          paymentStatus: { $ne: 'Failed' },
          orderStatus: { $ne: 'Payment Pending' },
        }),
        pendingCount,
        deliveredCount,
        cancelledCount,
        totalRevenue: totalRevenue[0]?.total || 0,
      },
    });
  } catch (err) {
    console.error('loadAdminOrders error:', err);
    res.redirect('/admin/dashBoard');
  }
};

export const loadAdminOrderDetail = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ orderId }).lean();
    if (!order) return res.redirect('/admin/orders');

    const user = await User.findById(order.userId).lean();

    const fmtDate = (d) =>
      d
        ? new Date(d).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : '-';
    const fmtTime = (d) =>
      d
        ? new Date(d).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';

    // Map per-item timelines and allowed next statuses
    const formattedProducts = order.products.map((item) => {
      const allowedNextStatuses = [];
      if (
        !FINALIZED_STATUSES.includes(item.orderStatus) &&
        item.orderStatus !== 'Cancelled'
      ) {
        const nextStatus = getNextAllowedStatus(item.orderStatus);
        if (nextStatus) allowedNextStatuses.push(nextStatus);
      }

      const tl = item.trackingTimeline || [];
      const formattedTimeline = tl
        .map((t) => ({
          ...t,
          dateFormatted: fmtDate(t.timestamp),
          timeFormatted: fmtTime(t.timestamp),
        }))
        .reverse();

      return {
        ...item,
        allowedNextStatuses,
        formattedTimeline,
      };
    });

    let totalCancelledRefunds = 0;
    let totalReturnedRefunds = 0;

    formattedProducts.forEach((item) => {
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

    res.render('admin/adminOrderDetail', {
      layout: 'admin',
      activePage: 'orders',
      order: {
        ...order,
        subtotalSalePrice: order.subtotalMrp - (order.discount || 0),
        products: formattedProducts,
        orderDateFormatted: fmtDate(order.orderDate),
        estimatedDeliveryFormatted: fmtDate(order.estimatedDelivery),
        totalCancelledRefunds,
        totalReturnedRefunds,
        finalAmountPaid,
      },
      user: user
        ? { name: user.name, email: user.email, phone: user.phone || '-' }
        : null,
    });
  } catch (err) {
    console.error('loadAdminOrderDetail error:', err);
    res.redirect('/admin/orders');
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { newStatus } = req.body;
    const { orderId } = req.params;
    const order = await Order.findOne({ orderId });
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });

    const currentStatus = order.orderStatus;

    // Block updates on finalized orders
    if (
      FINALIZED_STATUSES.includes(currentStatus) ||
      currentStatus === 'Cancelled'
    ) {
      return res
        .status(400)
        .json({ success: false, message: 'Cannot update a finalized order.' });
    }

    // Validate the requested new status is known
    if (!STATUS_FLOW.includes(newStatus)) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid status.' });
    }

    if (newStatus !== 'Cancelled') {
      // ── Strict sequential validation ──
      // The new status MUST be exactly the next step after current
      const allowedNext = getNextAllowedStatus(currentStatus);
      if (newStatus !== allowedNext) {
        // Provide a helpful, specific error message
        const requiredPrev = REQUIRED_PREV_STATUS[newStatus];
        if (requiredPrev && !requiredPrev.includes(currentStatus)) {
          return res.status(400).json({
            success: false,
            message: `Cannot set status to "${newStatus}" — order must be "${requiredPrev.join('" or "')}" first.`,
          });
        }
        return res.status(400).json({
          success: false,
          message: allowedNext
            ? `Next allowed status is "${allowedNext}". You cannot skip steps.`
            : 'No further status change is allowed for this order.',
        });
      }
    }

    order.orderStatus = newStatus;

    // Automatic COD Payment Fix
    if (newStatus === 'Delivered' && order.paymentMethod === 'COD') {
      order.paymentStatus = 'Paid';
    }

    // Sync the new status and tracking timeline to all active products
    const timelineEntry = {
      status: newStatus,
      message: `Status updated to ${newStatus} by admin`,
      timestamp: new Date(),
      completed: true,
    };

    for (let item of order.products) {
      if (
        ![
          'Cancelled',
          'Return Requested',
          'Return Approved',
          'Pickup Scheduled',
          'Return Picked',
          'Refund Processed',
          'Return Rejected',
          'Returned',
        ].includes(item.orderStatus)
      ) {
        item.orderStatus = newStatus;
        if (!item.trackingTimeline) item.trackingTimeline = [];
        item.trackingTimeline.push(timelineEntry);
      }
    }

    if (newStatus === 'Cancelled') {
      for (const item of order.products) {
        await Variant.findByIdAndUpdate(item.variantId, {
          $inc: { stock: item.quantity },
        });
      }
    }

    if (newStatus === 'Delivered') {
      // Referral Program Release Logic (First Delivered Order)
      const userOrders = await Order.find({ userId: order.userId }).lean();
      let hasPriorDelivery = false;
      for (const uOrder of userOrders) {
        if (uOrder._id.toString() !== order._id.toString()) {
          if (uOrder.products.some((p) => p.orderStatus === 'Delivered')) {
            hasPriorDelivery = true;
            break;
          }
        }
      }

      if (!hasPriorDelivery) {
        const session = await mongoose.startSession();
        try {
          session.startTransaction();
          const pendingReferral = await Referral.findOne({
            referredUser: order.userId,
            rewardStatus: 'PENDING',
          }).session(session);
          if (pendingReferral) {
            pendingReferral.rewardStatus = 'COMPLETED';
            pendingReferral.rewardReleaseDate = new Date();
            pendingReferral.firstDeliveredOrderId = order.orderId;
            await pendingReferral.save({ session });

            if (pendingReferral.referrerRewardAmount > 0) {
              await User.findByIdAndUpdate(
                pendingReferral.referrer,
                {
                  $inc: { walletBalance: pendingReferral.referrerRewardAmount },
                },
                { session }
              );
              await WalletTransaction.create(
                [
                  {
                    userId: pendingReferral.referrer,
                    type: 'Credit',
                    amount: pendingReferral.referrerRewardAmount,
                    description:
                      "Referral reward received after referred user's first delivered order.",
                  },
                ],
                { session }
              );
              await Notification.create(
                [
                  {
                    userId: pendingReferral.referrer,
                    message: `You received ₹${pendingReferral.referrerRewardAmount} referral reward.`,
                    type: 'Reward',
                  },
                ],
                { session }
              );
            }

            if (pendingReferral.referredRewardAmount > 0) {
              await User.findByIdAndUpdate(
                order.userId,
                {
                  $inc: { walletBalance: pendingReferral.referredRewardAmount },
                },
                { session }
              );
              await WalletTransaction.create(
                [
                  {
                    userId: order.userId,
                    type: 'Credit',
                    amount: pendingReferral.referredRewardAmount,
                    description:
                      'Referral signup reward unlocked after first delivered order.',
                  },
                ],
                { session }
              );
              await Notification.create(
                [
                  {
                    userId: order.userId,
                    message: `You received ₹${pendingReferral.referredRewardAmount} referral reward.`,
                    type: 'Reward',
                  },
                ],
                { session }
              );
            }
            await session.commitTransaction();
          } else {
            await session.abortTransaction();
          }
        } catch (error) {
          console.error('Referral Transaction Error:', error);
          await session.abortTransaction();
        } finally {
          session.endSession();
        }
      }
    }

    await order.save();
    res.json({
      success: true,
      message: `Order status updated to "${newStatus}" successfully.`,
    });
  } catch (err) {
    console.error('updateOrderStatus error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const updateItemStatus = async (req, res) => {
  try {
    const { newStatus } = req.body;
    const { orderId, itemId } = req.params;

    const order = await Order.findOne({ orderId });
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });

    const item = order.products.id(itemId);
    if (!item)
      return res
        .status(404)
        .json({ success: false, message: 'Item not found in order' });

    const currentStatus = item.orderStatus;

    if (
      FINALIZED_STATUSES.includes(currentStatus) ||
      currentStatus === 'Cancelled'
    ) {
      return res
        .status(400)
        .json({ success: false, message: 'Cannot update a finalized item.' });
    }

    if (!STATUS_FLOW.includes(newStatus)) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid status.' });
    }

    if (newStatus !== 'Cancelled') {
      const allowedNext = getNextAllowedStatus(currentStatus);
      if (newStatus !== allowedNext) {
        return res.status(400).json({
          success: false,
          message: `Cannot skip steps. Next allowed is "${allowedNext}".`,
        });
      }
    }

    item.orderStatus = newStatus;

    if (!item.trackingTimeline) item.trackingTimeline = [];
    item.trackingTimeline.push({
      status: newStatus,
      message: `Status updated to ${newStatus} by admin`,
      timestamp: new Date(),
      completed: true,
    });

    if (newStatus === 'Cancelled') {
      // 1. Restore Stock
      await Variant.findByIdAndUpdate(item.variantId, {
        $inc: { stock: item.quantity },
      });

      // 2. Refund to Wallet if Paid online
      if (order.paymentStatus === 'Paid' && order.paymentMethod !== 'COD') {
        const refundData = await calculateRefundAmount(
          order,
          item._id.toString(),
          item.quantity
        );
        let refundAmount = refundData.refundAmount;

        const willBeAllCancelled = order.products.every(
          (p) =>
            p._id.toString() === item._id.toString() ||
            p.orderStatus === 'Cancelled'
        );

        if (willBeAllCancelled && order.deliveryCharge > 0) {
          refundAmount += order.deliveryCharge;
        }

        if (refundAmount > 0) {
          item.refundAmountProcessed = refundAmount;
          item.refundStatus = 'Processed';
          await User.findByIdAndUpdate(order.userId, {
            $inc: { walletBalance: refundAmount },
          });
          await WalletTransaction.create({
            userId: order.userId,
            type: 'Credit',
            amount: refundAmount,
            description: `Refund for Cancelled Product (${item.productName})${willBeAllCancelled ? ' + Shipping' : ''}${refundData.thresholdBroken ? ' (Discount Revoked)' : ''}`,
            orderId: order.orderId,
            status: 'Success',
          });
        }
      }
    }

    // Auto-complete COD payment if all non-cancelled items are Delivered
    if (newStatus === 'Delivered') {
      if (order.paymentMethod === 'COD') {
        const allDone = order.products.every(
          (p) => p.orderStatus === 'Delivered' || p.orderStatus === 'Cancelled'
        );
        if (allDone) order.paymentStatus = 'Paid';
      }

      // Referral Program Release Logic (First Delivered Order)
      const userOrders = await Order.find({ userId: order.userId }).lean();
      let hasPriorDelivery = false;
      for (const uOrder of userOrders) {
        if (uOrder._id.toString() === order._id.toString()) {
          const previouslyDelivered =
            order.products.filter(
              (p) =>
                p.orderStatus === 'Delivered' && p._id.toString() !== itemId
            ).length > 0;
          if (previouslyDelivered) hasPriorDelivery = true;
        } else {
          if (uOrder.products.some((p) => p.orderStatus === 'Delivered')) {
            hasPriorDelivery = true;
            break;
          }
        }
      }

      if (!hasPriorDelivery) {
        const session = await mongoose.startSession();
        try {
          session.startTransaction();
          const pendingReferral = await Referral.findOne({
            referredUser: order.userId,
            rewardStatus: 'PENDING',
          }).session(session);
          if (pendingReferral) {
            pendingReferral.rewardStatus = 'COMPLETED';
            pendingReferral.rewardReleaseDate = new Date();
            pendingReferral.firstDeliveredOrderId = order.orderId;
            await pendingReferral.save({ session });

            if (pendingReferral.referrerRewardAmount > 0) {
              await User.findByIdAndUpdate(
                pendingReferral.referrer,
                {
                  $inc: { walletBalance: pendingReferral.referrerRewardAmount },
                },
                { session }
              );
              await WalletTransaction.create(
                [
                  {
                    userId: pendingReferral.referrer,
                    type: 'Credit',
                    amount: pendingReferral.referrerRewardAmount,
                    description:
                      "Referral reward received after referred user's first delivered order.",
                  },
                ],
                { session }
              );
              await Notification.create(
                [
                  {
                    userId: pendingReferral.referrer,
                    message: `You received ₹${pendingReferral.referrerRewardAmount} referral reward.`,
                    type: 'Reward',
                  },
                ],
                { session }
              );
            }

            if (pendingReferral.referredRewardAmount > 0) {
              await User.findByIdAndUpdate(
                order.userId,
                {
                  $inc: { walletBalance: pendingReferral.referredRewardAmount },
                },
                { session }
              );
              await WalletTransaction.create(
                [
                  {
                    userId: order.userId,
                    type: 'Credit',
                    amount: pendingReferral.referredRewardAmount,
                    description:
                      'Referral signup reward unlocked after first delivered order.',
                  },
                ],
                { session }
              );
              await Notification.create(
                [
                  {
                    userId: order.userId,
                    message: `You received ₹${pendingReferral.referredRewardAmount} referral reward.`,
                    type: 'Reward',
                  },
                ],
                { session }
              );
            }
            await session.commitTransaction();
          } else {
            await session.abortTransaction();
          }
        } catch (error) {
          console.error('Referral Transaction Error:', error);
          await session.abortTransaction();
        } finally {
          session.endSession();
        }
      }
    }

    // Derive parent order status (e.g. if all items Cancelled, order is Cancelled)
    const allCancelled = order.products.every(
      (p) => p.orderStatus === 'Cancelled'
    );
    const allDeliveredOrCancelled = order.products.every(
      (p) => p.orderStatus === 'Delivered' || p.orderStatus === 'Cancelled'
    );

    if (allCancelled) order.orderStatus = 'Cancelled';
    else if (allDeliveredOrCancelled) order.orderStatus = 'Delivered';

    await order.save();
    res.json({
      success: true,
      message: `Item status updated to "${newStatus}"`,
    });
  } catch (err) {
    console.error('updateItemStatus error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const loadSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne().lean();
    if (!settings) {
      settings = {
        standardShippingFee: 0,
        fastShippingFee: 50,
        returnPeriodDays: 7,
      };
    }
    res.render('admin/settings', {
      layout: 'admin',
      activePage: 'settings',
      settings,
    });
  } catch (err) {
    console.log(err);
    res.redirect('/admin/dashBoard');
  }
};

export const updateSettings = async (req, res) => {
  try {
    const { action } = req.body;
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings({});
    }

    if (action === 'referral') {
      const { referralProgramEnabled, referrerReward, referredReward } =
        req.body;
      settings.referralProgramEnabled = referralProgramEnabled;
      settings.referrerReward = parseFloat(referrerReward) || 0;
      settings.referredReward = parseFloat(referredReward) || 0;
    } else {
      const { standardShippingFee, fastShippingFee, returnPeriodDays } =
        req.body;
      settings.standardShippingFee = parseFloat(standardShippingFee) || 0;
      settings.fastShippingFee = parseFloat(fastShippingFee) || 0;
      settings.returnPeriodDays = parseInt(returnPeriodDays) || 7;
    }

    await settings.save();
    res.json({ success: true, message: 'Settings updated successfully.' });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const loadAdminReturns = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const statusFilter = req.query.status || 'all';

    let query = {
      orderStatus: {
        $in: [
          'Return Requested',
          'Return Approved',
          'Pickup Scheduled',
          'Return Picked',
          'Refund Processed',
          'Return Rejected',
          'Returned',
        ],
      },
    };

    if (search) {
      query.orderId = { $regex: search, $options: 'i' };
    }
    if (statusFilter !== 'all') {
      query.orderStatus = statusFilter;
    }

    const totalReturns = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalReturns / limit) || 1;

    const returnsList = await Order.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'name email')
      .lean();

    const fmtDate = (d) =>
      d
        ? new Date(d).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : '-';

    const formatted = returnsList.map((o) => ({
      ...o,
      orderDateFormatted: fmtDate(o.orderDate),
      updatedDateFormatted: fmtDate(o.updatedAt),
      customerName: o.shippingAddress?.fullName || o.userId?.name || '-',
      customerEmail: o.userId?.email || '-',
      productCount: o.products?.length || 0,
      firstProductName: o.products?.[0]?.productName || '-',
      // Return details
      returnReason: o.returnReason || 'No reason provided',
      refundMethod:
        o.products?.find((p) => p.refundMethod)?.refundMethod ||
        'Original Payment Method',
      returnRejectionReason: o.returnRejectionReason || '',
      returnPickupStatus: o.returnPickupStatus || 'Pending',
      returnRefundStatus: o.returnRefundStatus || 'Pending',
      returnInspectionStatus: o.returnInspectionStatus || 'Pending',
      returnInspectionDecision: o.returnInspectionDecision || '',
    }));

    res.render('admin/returnManagement', {
      layout: 'admin',
      activePage: 'returns',
      returns: formatted,
      currentPage: page,
      totalPages,
      search,
      status: statusFilter,
    });
  } catch (err) {
    console.error('loadAdminReturns error:', err);
    res.redirect('/admin/dashBoard');
  }
};

export const approveReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ orderId });
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });

    if (order.orderStatus !== 'Return Requested') {
      return res.status(400).json({
        success: false,
        message: 'Only Return Requested orders can be approved.',
      });
    }

    order.orderStatus = 'Return Approved';
    order.returnPickupStatus = 'Scheduled'; // Automatically updates pickup status

    // Sync to products
    for (let item of order.products) {
      if (item.orderStatus === 'Return Requested') {
        item.orderStatus = 'Return Approved';
        item.returnStatus = 'Approved';
        if (!item.trackingTimeline) item.trackingTimeline = [];
        item.trackingTimeline.push({
          status: 'Return Approved',
          message:
            'Your return request has been approved by the admin. Pickup is scheduled.',
          timestamp: new Date(),
          completed: true,
        });
      }
    }

    await order.save();
    res.json({
      success: true,
      message: 'Return request approved. Pickup status updated to Scheduled.',
    });
  } catch (err) {
    console.error('approveReturn error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const rejectReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid rejection reason (min 5 chars).',
      });
    }

    const order = await Order.findOne({ orderId });
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });

    if (order.orderStatus !== 'Return Requested') {
      return res.status(400).json({
        success: false,
        message: 'Only Return Requested orders can be rejected.',
      });
    }

    order.orderStatus = 'Return Rejected';
    order.returnRejectionReason = reason;

    // Sync to products
    for (let item of order.products) {
      if (item.orderStatus === 'Return Requested') {
        item.orderStatus = 'Return Rejected';
        item.returnStatus = 'Rejected';
        item.returnRejectionReason = reason;
        if (!item.trackingTimeline) item.trackingTimeline = [];
        item.trackingTimeline.push({
          status: 'Return Rejected',
          message: `Return request rejected. Reason: ${reason}`,
          timestamp: new Date(),
          completed: true,
        });
      }
    }

    await order.save();
    res.json({ success: true, message: 'Return request rejected.' });
  } catch (err) {
    console.error('rejectReturn error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const updatePickupStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { pickupStatus } = req.body;

    const order = await Order.findOne({ orderId });
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });

    if (
      !['Return Approved', 'Pickup Scheduled', 'Return Picked'].includes(
        order.orderStatus
      )
    ) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update pickup status for this order.',
      });
    }

    order.returnPickupStatus = pickupStatus;

    // Sync to products
    const timelineEntry = {
      timestamp: new Date(),
      completed: true,
    };

    if (pickupStatus === 'Picked') {
      order.orderStatus = 'Return Picked';
      timelineEntry.status = 'Return Picked';
      timelineEntry.message =
        'Returned product picked up and received at sorting facility.';
    } else if (pickupStatus === 'Scheduled') {
      order.orderStatus = 'Pickup Scheduled';
      timelineEntry.status = 'Pickup Scheduled';
      timelineEntry.message = 'Return pickup has been scheduled.';
    }

    for (let item of order.products) {
      if (
        item.orderStatus === 'Return Approved' ||
        item.orderStatus === 'Pickup Scheduled'
      ) {
        if (pickupStatus === 'Picked') {
          item.orderStatus = 'Return Picked';
          item.returnStatus = 'Picked';
        } else if (pickupStatus === 'Scheduled') {
          item.orderStatus = 'Pickup Scheduled';
        }

        if (!item.trackingTimeline) item.trackingTimeline = [];
        item.trackingTimeline.push(timelineEntry);
      }
    }

    await order.save();
    res.json({
      success: true,
      message: `Pickup status updated to ${pickupStatus}.`,
    });
  } catch (err) {
    console.error('updatePickupStatus error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const inspectReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { decision } = req.body; // 'Restock' or 'Damaged'

    if (!['Restock', 'Damaged'].includes(decision)) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid inspection decision.' });
    }

    const order = await Order.findOne({ orderId });
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });

    if (order.orderStatus !== 'Return Picked') {
      return res.status(400).json({
        success: false,
        message: 'Inspection can only be performed after return is Picked up.',
      });
    }

    order.returnInspectionStatus = 'Inspected';
    order.returnInspectionDecision = decision;
    order.orderStatus = 'Returned'; // Mark return as completed

    const isRestocked = decision === 'Restock';
    const message = `Return inspection completed. Decision: ${isRestocked ? 'Restocked to inventory' : 'Marked as damaged'}`;

    for (let item of order.products) {
      if (item.orderStatus === 'Return Picked') {
        item.orderStatus = 'Returned';
        item.returnStatus = 'Returned';
        item.returnInspectionStatus = 'Inspected';
        item.returnInspectionDecision = decision;

        // Also trigger a mock refund logic mark here for completeness based on user requirements
        item.refundStatus = 'Processed';

        if (!item.trackingTimeline) item.trackingTimeline = [];
        item.trackingTimeline.push({
          status: 'Returned',
          message,
          timestamp: new Date(),
          completed: true,
        });

        if (isRestocked) {
          await Variant.findByIdAndUpdate(item.variantId, {
            $$inc: { stock: item.quantity },
          });
          const variant = await Variant.findById(item.variantId);
          if (variant && variant.isDefault) {
            await Product.findByIdAndUpdate(item.productId, {
              stock: variant.stock,
            });
          }
        }
      }
    }

    await order.save();
    res.json({
      success: true,
      message: `Inspection completed successfully. Decision: ${decision}.`,
    });
  } catch (err) {
    console.error('inspectReturn error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const updateRefundStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { refundStatus } = req.body; // e.g. 'Processed'

    const order = await Order.findOne({ orderId });
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });

    if (
      !['Returned', 'Return Picked', 'Refund Processed'].includes(
        order.orderStatus
      )
    ) {
      return res.status(400).json({
        success: false,
        message: 'Refund can only be processed after pickup/inspection.',
      });
    }

    order.returnRefundStatus = refundStatus;
    if (refundStatus === 'Processed') {
      order.orderStatus = 'Refund Processed';
      order.paymentStatus = 'Refunded';
      order.trackingTimeline.push({
        status: 'Refund Processed',
        message: `Refund of ₹${order.totalAmount} processed successfully to user account.`,
        timestamp: new Date(),
        completed: true,
      });

      // Credit the user's wallet
      const user = await User.findById(order.userId);
      if (user) {
        user.walletBalance = (user.walletBalance || 0) + order.totalAmount;
        await user.save();
      }
    }

    await order.save();
    res.json({
      success: true,
      message: `Refund status updated to ${refundStatus}.`,
    });
  } catch (err) {
    console.error('updateRefundStatus error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const updateItemReturnAction = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { action, reason, newStatus } = req.body;

    const order = await Order.findOne({ orderId });
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });

    const item = order.products.id(itemId);
    if (!item)
      return res
        .status(404)
        .json({ success: false, message: 'Item not found' });

    const STATUS_META = {
      'Return Approved': {
        returnStatus: 'Approved',
        msg: 'Return approved. Pickup scheduled.',
      },
      'Pickup Scheduled': {
        returnStatus: 'Scheduled',
        msg: 'Pickup has been scheduled.',
      },
      'Return Picked': {
        returnStatus: 'Picked',
        msg: 'Item picked up by courier.',
      },
      'Return Rejected': {
        returnStatus: 'Rejected',
        msg: 'Return rejected by admin.',
      },
      Returned: {
        returnStatus: 'Returned',
        msg: 'Item returned and restocked.',
      },
      'Refund Processed': {
        returnStatus: 'Refunded',
        msg: 'Refund processed to customer wallet.',
      },
    };

    if (action === 'approve') {
      item.orderStatus = 'Return Approved';
      item.returnStatus = 'Approved';
      item.trackingTimeline.push({
        status: 'Return Approved',
        message: 'Return request approved by admin. Pickup is scheduled.',
        timestamp: new Date(),
        completed: true,
      });
      order.orderStatus = 'Return Approved';
      await order.save();
      return res.json({
        success: true,
        message: 'Return approved successfully.',
      });
    }

    if (action === 'reject') {
      if (!reason || reason.trim().length < 5)
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid rejection reason (min 5 chars).',
        });
      item.orderStatus = 'Return Rejected';
      item.returnStatus = 'Rejected';
      item.returnRejectionReason = reason;
      item.trackingTimeline.push({
        status: 'Return Rejected',
        message: 'Return rejected. Reason: ' + reason,
        timestamp: new Date(),
        completed: true,
      });
      order.orderStatus = 'Return Rejected';
      order.returnRejectionReason = reason;
      await order.save();
      return res.json({ success: true, message: 'Return rejected.' });
    }

    if (action === 'status') {
      const meta = STATUS_META[newStatus];
      if (!meta)
        return res
          .status(400)
          .json({ success: false, message: 'Invalid status.' });

      let trackingMsg = meta.msg;

      if (newStatus === 'Returned') {
        const condition = req.body.returnCondition;
        if (condition === 'Stock') {
          await Variant.findByIdAndUpdate(item.variantId, {
            $inc: { stock: item.quantity },
          });
          trackingMsg = 'Item returned and restocked.';
        } else if (condition === 'Repair') {
          trackingMsg = 'Item returned and sent for repair.';
        }

        // Automatic Refund Processing
        const refundData = await calculateRefundAmount(
          order,
          item._id.toString(),
          item.quantity
        );
        let refundAmount = refundData.refundAmount;

        const willBeAllReturnedOrCancelled = order.products.every(
          (p) =>
            p._id.toString() === item._id.toString() ||
            p.orderStatus === 'Returned' ||
            p.orderStatus === 'Cancelled'
        );

        if (willBeAllReturnedOrCancelled && order.deliveryCharge > 0) {
          refundAmount += order.deliveryCharge;
        }

        if (order.paymentStatus === 'Paid' && refundAmount > 0) {
          item.refundAmountProcessed = refundAmount;
          item.refundStatus = 'Processed';
          const user = await User.findById(order.userId);
          if (user) {
            user.walletBalance = (user.walletBalance || 0) + refundAmount;
            await user.save();
            const newTxn = new WalletTransaction({
              userId: order.userId,
              type: 'Credit',
              amount: refundAmount,
              description: `Refund for Returned Product (${item.productName})${willBeAllReturnedOrCancelled ? ' + Shipping' : ''}${refundData.thresholdBroken ? ' (Discount Revoked)' : ''}`,
              orderId: order.orderId,
              status: 'Success',
            });
            await newTxn.save();
          }
        }
      }

      item.orderStatus = newStatus;
      item.returnStatus = meta.returnStatus;
      item.trackingTimeline.push({
        status: newStatus,
        message: trackingMsg,
        timestamp: new Date(),
        completed: true,
      });
      order.orderStatus = newStatus;

      await order.save();
      return res.json({
        success: true,
        message: 'Status updated to ' + newStatus + '.',
      });
    }

    return res.status(400).json({ success: false, message: 'Invalid action.' });
  } catch (err) {
    console.error('updateItemReturnAction error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
