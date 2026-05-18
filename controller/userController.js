import userSchema from "../model/userModel.js";
import bcrypt from "bcrypt";
import cloudinary from "../config/cloudinary.js";
import addressModel from "../model/addressModel.js";
import { generateAndSaveOtp, verifyOtpFromDb } from "../services/otpService.js";
import Category from "../model/categoryModel.js";
import Product from "../model/productModel.js";
import Variant from "../model/variantModel.js";
import Wishlist from "../model/wishlistModel.js";
import Cart from "../model/cartModel.js";

// user auth and profile

export const loadRegister = async (req, res) => {
  let message = req.query.message || "";
  res.render("user/register", { layout: "auth", message });
};

export const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const user = await userSchema.findOne({ email });

    if (user) {
      return res.render("user/login", {
        layout: "auth",
        message: "user already exists",
      });
    }

    const passwordPattern =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

    if (!passwordPattern.test(password)) {
      return res.render("user/register", {
        layout: "auth",
        message:
          "Password must be strong (uppercase, lowercase, number, symbol)",
      });
    }

    req.session.userData = { name, email, password };
    await generateAndSaveOtp({ email, purpose: "register" });

    req.session.changeEmailLink = "/user/register";
    res.redirect("/user/otp");
  } catch (err) {
    res.render("user/register", {
      layout: "auth",
      message: "Something went wrong",
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
  if (req.query.msg === "blocked") {
    message = "Your account has been blocked by admin";
  }

  if (req.query.msg === "deleted") {
    message = "Your account has been deleted by admin";
  }

  res.render("user/login", { layout: "auth", message, success });
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await userSchema.findOne({ email });
    if (!user) {
      return res.render("user/login", {
        layout: "auth",
        message: "User not exists",
      });
    }

    if (user.isBlocked) {
      return res.render("user/login", {
        layout: "auth",
        message: "Your account is blocked by the Admin",
      });
    }

    if (!user.password) {
      return res.render("user/login", {
        layout: "auth",
        message:
          "You registered using Google. Please login with Google and set your password in profile or please continue with forgot password.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.render("user/login", {
        layout: "auth",
        message: "Incorrect password",
      });
    }

    req.session.user = {
      id: user._id,
      name: user.name,
    };

    res.redirect("/user/");
  } catch (err) {
    res.render("user/login", {
      layout: "auth",
      message: "Something went wrong",
    });
  }
};

export const homePage = async (req, res) => {
  try {
    let message = req.query.message || null;

    // Find category IDs that have at least one active product with active variants
    const activeCategoryIds = await Product.distinct("category", {
      status: "active",
      deleted_at: null,
    });

    // only categories whose products have at least one active variant
    const productsWithActiveVariants = await Variant.distinct("product", {
      status: "active",
      deleted_at: null,
    });

    const productIdsWithVariants = await Product.distinct("_id", {
      _id: { $in: productsWithActiveVariants },
      status: "active",
      deleted_at: null,
    });

    const validCategoryIds = await Product.distinct("category", {
      _id: { $in: productIdsWithVariants },
      status: "active",
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
      image: c.image_url || "",
    }));

    if (req.session.user) {
      const user = await userSchema.findById(req.session.user.id);

      if (!user) {
        req.session.user = null;
        return res.render("user/home", {
          layout: "main",
          user: null,
          message: "Your account has been deleted by admin",
          navCategories,
          categories: navCategories,
        });
      }

      if (user.isBlocked) {
        req.session.user = null;
        return res.render("user/home", {
          layout: "main",
          user: null,
          message: "Your account has been blocked by admin",
          navCategories,
          categories: navCategories,
        });
      }
    }

    res.render("user/home", {
      layout: "main",
      user: req.session.user || null,
      message,
      navCategories,
      categories: navCategories,
    });
  } catch (err) {
    console.log(err);
    res.render("user/home", {
      layout: "main",
      user: null,
      message: "Something went wrong",
      navCategories: [],
      categories: [],
    });
  }
};

export const logout = (req, res) => {
  req.session.user = null;
  res.redirect("/user/?message=Logged out successfully");
};

export const loadForgotPassword = (req, res) => {
  res.render("user/forgotPassword", { layout: "auth" });
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.render("user/forgotPassword", {
        layout: "auth",
        message: "Email required",
      });
    }

    const user = await userSchema.findOne({ email });

    if (!user) {
      return res.render("user/forgotPassword", {
        layout: "auth",
        message: "Email not registered",
      });
    }

    if (!user.password) {
      return res.render("user/forgotPassword", {
        layout: "auth",
        message: "You registered using Google. Please login with Google.",
      });
    }
    req.session.userData = null;

    req.session.resetEmail = email;

    await generateAndSaveOtp({ email, purpose: "forgot_password" });

    req.session.save();
    req.session.changeEmailLink = "/user/forgotPassword";
    return res.redirect("/user/forgotOtp");
  } catch (err) {
    console.log(err);
    return res.render("user/forgotPassword", {
      layout: "auth",
      message: "Something went wrong",
    });
  }
};

export const loadResetPassword = (req, res) => {
  if (!req.session.resetVerified) {
    return res.redirect("/user/forgotPassword");
  }
  res.render("user/resetPassword", { layout: "auth" });
};

export const resetPassword = async (req, res) => {
  try {
    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
      return res.render("user/resetPassword", {
        layout: "auth",
        message: "All fields required",
      });
    }

    if (password !== confirmPassword) {
      return res.render("user/resetPassword", {
        layout: "auth",
        message: "Passwords do not match",
      });
    }

    const passwordPattern =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

    if (!passwordPattern.test(password)) {
      return res.render("user/resetPassword", {
        layout: "auth",
        message: "Strong password required",
      });
    }

    const hashed = await bcrypt.hash(password, 10);

    await userSchema.updateOne(
      { email: req.session.resetEmail },
      { $set: { password: hashed } },
    );

    req.session.resetEmail = null;
    req.session.resetVerified = null;
    return res.redirect(
      "/user/login?message=Password changed successfully&success=true",
    );
  } catch (err) {
    console.log(err);

    return res.render("user/resetPassword", {
      layout: "auth",
      message: "Something went wrong",
    });
  }
};

export const loadProfile = async (req, res) => {
  try {
    let user = await userSchema.findById(req.session.user.id).lean();

    if (user?.dob) {
      user.dob = new Date(user.dob).toLocaleDateString("en-GB");
    }

    res.render("user/userProfile", {
      layout: "main",
      user,
      hasPassword: !!user.password,
      isGoogleUser: !user.password,
    });
  } catch (err) {
    console.log(err);
    res.redirect("/user/");
  }
};

export const loadEditProfile = async (req, res) => {
  try {
    let user = await userSchema.findById(req.session.user.id).lean();

    if (user.dob) {
      user.dob = new Date(user.dob).toISOString().split("T")[0];
    }

    res.render("user/editProfile", { layout: "main", user });
  } catch (err) {
    console.log(err);
    res.redirect("/user/userProfile");
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { name, phone, dob, removeAvatar } = req.body || {};

    const user = await userSchema.findById(req.session.user.id);

    const nameRegex = /^[A-Za-z]+(?:\s[A-Za-z]+)*$/;

    if (!nameRegex.test(name.trim())) {
      return res.render("user/editProfile", {
        layout: "main",
        user,
        message: "Name must contain only letters and spaces",
      });
    }

    const phoneRegex = /^[0-9]{10}$/;

    if (!phoneRegex.test(phone)) {
      return res.render("user/editProfile", {
        layout: "main",
        user,
        message: "Phone number must be 10 digits",
      });
    }

    if (!dob) {
      return res.render("user/editProfile", {
        layout: "main",
        user,
        message: "Date of Birth is required",
      });
    }

    const birthDate = new Date(dob);
    const today = new Date();

    if (isNaN(birthDate.getTime())) {
      return res.render("user/editProfile", {
        layout: "main",
        user,
        message: "Invalid Date of Birth",
      });
    }

    if (birthDate >= today) {
      return res.render("user/editProfile", {
        layout: "main",
        user,
        message: "Date of Birth must be in the past",
      });
    }

    if (birthDate.getFullYear() === today.getFullYear()) {
      return res.render("user/editProfile", {
        layout: "main",
        user,
        message: "Birth year cannot be current year",
      });
    }

    let age = today.getFullYear() - birthDate.getFullYear();

    if (age < 13) {
      return res.render("user/editProfile", {
        layout: "main",
        user,
        message: "Age must be at least 13 years",
      });
    }

    let updateData = {
      name: name.trim(),
      phone: phone.trim(),
      dob: new Date(dob),
    };

    if (removeAvatar === "true") {
      updateData.avatar = null;
    } else if (req.file) {
      updateData.avatar = req.file.path;
    }

    await userSchema.findByIdAndUpdate(
      req.session.user.id,
      { $set: updateData },
      { returnDocument: "after" },
    );

    req.session.user.name = name.trim();
    res.redirect("/user/profile");
  } catch (err) {
    console.log(err);
    res.redirect("/user/editProfile");
  }
};

export const changeEmail = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.json({ success: false, message: "Email required" });
    }

    const existing = await userSchema.findOne({ email });

    if (existing) {
      return res.json({ success: false, message: "Email already exists" });
    }

    req.session.changeEmail = email;

    await generateAndSaveOtp({ email, purpose: "change_email" });

    req.session.save();

    return res.json({ success: true });
  } catch (err) {
    console.log(err);
    return res.json({ success: false, message: "Something went wrong" });
  }
};

export const verifyChangeEmail = async (req, res) => {
  try {
    const { otp } = req.body;
    const result = await verifyOtpFromDb({
      email: req.session.changeEmail,
      otp_code: otp,
      purpose: "change_email",
    });

    if (!result.success) {
      return res.json({ success: false, message: "Invalid or expired OTP" });
    }

    await userSchema.findByIdAndUpdate(req.session.user.id, {
      email: req.session.changeEmail,
    });
    req.session.changeEmail = null;
    return res.json({ success: true });
  } catch (err) {
    console.log(err);
    return res.json({ success: false, message: "Something went wrong" });
  }
};

export const resendChangeEmailOtp = async (req, res) => {
  try {
    if (!req.session.changeEmail) {
      return res.json({ success: false, message: "Session expired" });
    }

    await generateAndSaveOtp({
      email: req.session.changeEmail,
      purpose: "change_email",
    });

    return res.json({ success: true });
  } catch (err) {
    console.log(err);
    return res.json({ success: false });
  }
};

export const deleteAccount = async (req, res) => {
  try {
    console.log("BODY:", req.body);

    const { confirmText } = req.body;

    if (confirmText !== "DELETE") {
      return res.redirect("/user/profile");
    }

    const userId = req.session.user.id;

    const user = await userSchema.findById(userId);

    if (user?.avatar) {
      const publicId = user.avatar.split("/").pop().split(".")[0];
      await cloudinary.uploader.destroy("tymora/users/" + publicId);
    }
    await userSchema.findByIdAndDelete(userId);

    req.session.user = null;
    res.redirect("/user/home?message=Account deleted successfully");
  } catch (err) {
    console.log(err);
    res.redirect("/user/profile");
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const user = await userSchema.findById(req.session.user.id);

    if (!user.password) {
      if (!newPassword || !confirmPassword) {
        return res.json({ success: false, message: "All fields required" });
      }

      const passwordPattern =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

      if (!passwordPattern.test(newPassword)) {
        return res.json({ success: false, message: "Weak password" });
      }

      if (newPassword !== confirmPassword) {
        return res.json({ success: false, message: "Passwords do not match" });
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
      return res.json({ success: false, message: "All fields required" });
    }

    const passwordPattern =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

    if (!passwordPattern.test(newPassword)) {
      return res.json({ success: false, message: "Weak password" });
    }

    if (currentPassword === newPassword) {
      return res.json({
        success: false,
        message: "New password must be different",
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.json({
        success: false,
        message: "Current password incorrect",
      });
    }
    if (newPassword !== confirmPassword) {
      return res.json({ success: false, message: "Passwords do not match" });
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
    return res.json({ success: false, message: "Something went wrong" });
  }
};

export const loadAddressPage = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const addresses = await addressModel.find({ userId });
    res.render("user/myAddress", { layout: "main", addresses });
  } catch (err) {
    console.log(err);
    res.redirect("/user/profile");
  }
};

export const addAddress = async (req, res) => {
  try {
    console.log("BODY:", req.body);

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
      return res.json({ success: false, message: "All fields required" });
    }

    if (!/^[0-9]{10}$/.test(phone)) {
      return res.json({ success: false, message: "Invalid phone number" });
    }

    if (!/^[0-9]{6}$/.test(pincode)) {
      return res.json({ success: false, message: "Invalid pincode" });
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
    res.json({ success: false, message: "Failed to add address" });
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
        { isDefault: false },
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

    res.redirect("/user/address");
  } catch (err) {
    console.log(err);
    res.redirect("/user/address");
  }
};

export const deleteAddress = async (req, res) => {
  try {
    await addressModel.findByIdAndDelete(req.params.id);

    res.redirect("/user/address");
  } catch (err) {
    console.log(err);
    res.redirect("/user/address");
  }
};

// categorys and products

export const loadshop = async (req, res) => {
  try {
    const {
      q = "",
      cat = "",
      brand = "",
      style = "",
      avail = "",
      sort = "",
      priceMin = "",
      priceMax = "",
      page = "1",
    } = req.query;

    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const PER_PAGE = 8;

    const mongoFilter = {
      status: "active",
      deleted_at: null,
    };

    if (avail === "instock") mongoFilter.stock = { $gt: 0 };
    if (avail === "outofstock") mongoFilter.stock = { $lte: 0 };
    if (avail === "sale") mongoFilter.discount = { $gt: 0 };
    if (avail === "new") mongoFilter.featured = true;

    if (priceMin !== "" || priceMax !== "") {
      mongoFilter.price = {};
      if (priceMin !== "") mongoFilter.price.$gte = parseFloat(priceMin);
      if (priceMax !== "") mongoFilter.price.$lte = parseFloat(priceMax);
    }

    const sortMap = {
      "price-asc": { price: 1 },
      "price-desc": { price: -1 },
      az: { name: 1 },
      za: { name: -1 },
      newest: { createdAt: -1 },
    };
    const mongoSort = sortMap[sort] || { createdAt: -1 };

    let dbProducts = await Product.find(mongoFilter)
      .populate("category", "name is_visible deleted_at")
      .populate("brand", "name")
      .sort(mongoSort)
      .lean();

    dbProducts = dbProducts.filter(
      (p) =>
        p.category &&
        p.category.is_visible !== false &&
        p.category.deleted_at == null,
    );

    if (brand.trim()) {
      dbProducts = dbProducts.filter(
        (p) =>
          (p.brand?.name || "").toLowerCase() === brand.trim().toLowerCase(),
      );
    }

    if (cat.trim()) {
      dbProducts = dbProducts.filter(
        (p) =>
          (p.category?.name || "").toLowerCase() === cat.trim().toLowerCase(),
      );
    }

    if (style.trim()) {
      dbProducts = dbProducts.filter(
        (p) => (p.gender || "").toLowerCase() === style.trim().toLowerCase(),
      );
    }

    if (q.trim()) {
      const qLower = q.trim().toLowerCase();
      dbProducts = dbProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(qLower) ||
          (p.brand?.name || "").toLowerCase().includes(qLower),
      );
    }

    if (sort === "rating") {
      dbProducts.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    }

    const productIds = dbProducts.map((p) => p._id);

    const activeVariants = await Variant.find({
      product: { $in: productIds },
      status: "active",
      deleted_at: null,
    }).lean();

    const variantsByProduct = {};
    activeVariants.forEach((v) => {
      const pid = v.product.toString();
      if (!variantsByProduct[pid]) variantsByProduct[pid] = [];
      variantsByProduct[pid].push(v);
    });

    dbProducts = dbProducts.filter(
      (p) => (variantsByProduct[p._id.toString()] || []).length > 0,
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
        brand: p.brand?.name || "Unknown",
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
        cat: (p.category?.name || "other").toLowerCase(),
        style: (p.gender || "").toLowerCase(),
        avail: displayVariant?.stock > 0 ? "instock" : "outofstock",
        stock: displayVariant?.stock ?? 0,
        variantId: displayVariant?._id.toString() || "",
        img:
          displayVariant?.images?.[0] ||
          p.images?.[0] ||
          "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=400&q=80",
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
          wl.products.map((p) => p.productId.toString()),
        );
        shaped.forEach((p) => {
          p.wished = wishedSet.has(p.id);
        });
      }

      if (cart && cart.items.length) {
        const cartVariantSet = new Set(
          cart.items.map((i) => i.variantId.toString()),
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
    if (q) activeTags.push({ label: `"${q}"`, key: "q" });
    if (cat)
      activeTags.push({
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
        key: "cat",
      });
    if (brand) activeTags.push({ label: brand, key: "brand" });
    if (style) activeTags.push({ label: style, key: "style" });
    if (avail) activeTags.push({ label: avail, key: "avail" });
    if (priceMin || priceMax)
      activeTags.push({
        label: `₹${priceMin || 0} – ₹${priceMax || "∞"}`,
        key: "price",
      });

    res.render("user/allProducts", {
      layout: "main",
      user: req.session.user || null,

      totalProducts,
      shownCount: pageProducts.length,
      startCount: totalProducts ? startIdx + 1 : 0,

      filters: { q, cat, brand, style, avail, priceMin, priceMax, sort },

      sortOptions: [
        {
          value: "price-asc",
          label: "Price: Low to High",
          selected: sort === "price-asc",
        },
        {
          value: "price-desc",
          label: "Price: High to Low",
          selected: sort === "price-desc",
        },
        { value: "az", label: "Name: A – Z", selected: sort === "az" },
        { value: "za", label: "Name: Z – A", selected: sort === "za" },
        { value: "rating", label: "Top Rated", selected: sort === "rating" },
        { value: "newest", label: "Newest", selected: sort === "newest" },
      ],

      filterOptions: {
        categories: allCategories,
        brands: allBrands,
        styles: allStyles,
        availability: [
          {
            value: "instock",
            label: "In Stock",
            selected: avail === "instock",
          },
          {
            value: "outofstock",
            label: "Out of Stock",
            selected: avail === "outofstock",
          },
          { value: "sale", label: "On Sale", selected: avail === "sale" },
          { value: "new", label: "Featured", selected: avail === "new" },
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
      searchPlaceholder: "Search watches…",
      shopData: { featured },
    });
  } catch (err) {
    console.error("loadshop error:", err);
    res.render("user/allProducts", {
      layout: "main",
      user: req.session.user || null,
      totalProducts: 0,
      shownCount: 0,
      startCount: 0,
      filters: {
        q: "",
        cat: "",
        brand: "",
        style: "",
        avail: "",
        priceMin: "",
        priceMax: "",
        sort: "",
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
      searchPlaceholder: "Search watches…",
      shopData: { featured: [] },
    });
  }
};

const DEFAULT_BADGES = [
  "CURATED",
  "PREMIUM",
  "SIGNATURE",
  "CLASSIC",
  "LUXURY PICK",
];

function getDefaultBadgeLabel(product) {
  const seed =
    parseInt((product._id || product.id || "0").toString().slice(-2), 16) || 0;
  return DEFAULT_BADGES[seed % DEFAULT_BADGES.length];
}

function getPrimaryBadge(product, variant) {
  const stock = variant?.stock ?? product.stock ?? 999;
  const hoursSinceCreated = product.createdAt
    ? (Date.now() - new Date(product.createdAt).getTime()) / 3600000
    : 9999;

  if (product.dealOfTheDay)
    return { badge: "deal", badgeLabel: "DEAL OF THE DAY" };
  if (product.featured) return { badge: "featured", badgeLabel: "BEST PICK" };
  if (stock > 0 && stock <= 5)
    return { badge: "low-stock", badgeLabel: `ONLY ${stock} LEFT` };
  if (hoursSinceCreated <= 24) return { badge: "new", badgeLabel: "NEW" };
  return { badge: "default", badgeLabel: getDefaultBadgeLabel(product) };
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
      status: "active",
      deleted_at: null,
    })
      .populate("brand", "name")
      .populate("category", "name is_visible deleted_at")
      .lean();

    if (
      !product ||
      !product.category ||
      product.category.is_visible === false ||
      product.category.deleted_at
    ) {
      return res.redirect("/user/shop");
    }

    const variants = await Variant.find({
      product: id,
      status: "active",
      deleted_at: null,
    }).lean();

    if (!variants.length) return res.redirect("/user/shop");

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
      sku: v.sku || "",
      strapColor: v.strapColor || "",
      dialColor: v.dialColor || "",
      caseColor: v.caseColor || "",
      strapMaterial: v.strapMaterial || "",
      caseMaterial: v.caseMaterial || "",
      size: v.size || "",
      originalPrice: v.originalPrice ?? 0,
      salePrice: v.salePrice ?? 0,
      discountPct: v.discountPercentage ?? 0,
      stock: v.stock ?? 0,
      images: v.images || [],
      isDefault: !!v.isDefault,
      inCart: cartItems.includes(v._id.toString()),
      avail: v.stock > 0 ? "instock" : "outofstock",
    }));

    const relatedRaw = await Product.find({
      _id: { $ne: id },
      category: product.category._id,
      status: "active",
      deleted_at: null,
    })
      .populate("brand", "name")
      .limit(8)
      .lean();

    const relatedVariants = await Variant.find({
      product: { $in: relatedRaw.map((p) => p._id) },
      status: "active",
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
          brand: p.brand?.name || "TYMORA",
          price: rv.salePrice ?? rv.price ?? 0,
          oldPrice: rv.originalPrice > rv.salePrice ? rv.originalPrice : null,
          discountPct: rv.discountPercentage ?? 0,
          rating: p.rating ?? 4.5,
          reviews: p.reviews ?? 0,
          badge: getProductBadge(p, rv),
          badgeLabel: getProductBadgeLabel(p, rv),
          avail: rv.stock > 0 ? "instock" : "outofstock",
          img: rv.images?.[0] || p.images?.[0] || "",
          variantId: vid,
          wished: wishedSet.has(pid),
          inCart: cartVariantSet.has(vid),
        };
      });

    res.render("user/productDetail", {
      layout: "main",
      user: req.session.user || null,
      product: {
        id: product._id.toString(),
        name: product.name,
        brand: product.brand?.name || "TYMORA",
        description: product.description || "",
        gender: product.gender || "",
        category: product.category?.name || "",
        tags: product.tags || [],
        featured: product.featured || false,
        dealOfTheDay: product.dealOfTheDay || false,
        rating: product.rating ?? 4.5,
        reviewCount: product.reviews ?? 0,
        price: finalPrice,
        oldPrice,
        discountPct,
        sku:
          displayVariant.sku ||
          displayVariant._id.toString().slice(-8).toUpperCase(),
        avail: displayVariant.stock > 0 ? "instock" : "outofstock",
        stock: displayVariant.stock ?? 0,
        images: displayVariant.images?.length
          ? displayVariant.images
          : product.images || [],
        wished,
        variantId: displayVariant._id.toString(),
        inCart: cartItems.includes(displayVariant._id.toString()),
      },
      variantData,
      relatedProducts,
    });
  } catch (err) {
    console.error("loadProductDetail error:", err);
    res.redirect("/user/shop");
  }
};

export const loadWishlist = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const wishlist = await Wishlist.findOne({ userId }).lean();

    if (!wishlist || !wishlist.products.length) {
      return res.render("user/wishlist", {
        layout: "main",
        user: req.session.user,
        products: [],
      });
    }

    const productIds = wishlist.products.map((p) => p.productId);

    const dbProducts = await Product.find({
      _id: { $in: productIds },
      status: "active",
      deleted_at: null,
    })
      .populate("brand", "name")
      .populate("category", "name is_visible deleted_at")
      .lean();

    const activeIds = dbProducts.map((p) => p._id.toString());
    const variantDocs = await Variant.find({
      product: { $in: activeIds },
      status: "active",
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
          brand: p.brand?.name || "TYMORA",
          price:
            display.salePrice ?? display.price ?? p.salePrice ?? p.price ?? 0,
          oldPrice:
            (p.discountPercentage ?? p.discount) > 0
              ? (display.originalPrice ?? p.originalPrice ?? null)
              : null,
          rating: p.rating ?? 4.5,
          reviews: p.reviews ?? 0,
          ...getPrimaryBadge(p, display),
          avail: display.stock > 0 ? "instock" : "outofstock",
          img: display.images?.[0] || p.images?.[0] || "",
          variantId: display._id.toString(),
          inCart: cartVariantSet.has(display._id.toString()),
        };
      })
      .filter(Boolean);

    res.render("user/wishlist", {
      layout: "main",
      user: req.session.user,
      products,
    });
  } catch (err) {
    console.error("loadWishlist error:", err);
    res.render("user/wishlist", {
      layout: "main",
      user: req.session.user,
      products: [],
    });
  }
};

export const toggleWishlist = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { productId } = req.body;

    if (!userId) return res.json({ success: false, redirect: "/user/login" });
    if (!productId)
      return res.json({ success: false, message: "Missing productId" });

    // Check if product is already in wishlist
    const existing = await Wishlist.findOne({
      userId,
      "products.productId": productId,
    });

    if (existing) {
      await Wishlist.findOneAndUpdate(
        { userId },
        { $pull: { products: { productId } } },
        { new: true },
      );
      return res.json({ success: true, status: "removed" });
    } else {
      await Wishlist.findOneAndUpdate(
        { userId, "products.productId": { $ne: productId } },
        { $push: { products: { productId } } },
        { upsert: true, new: true },
      );
      return res.json({ success: true, status: "added" });
    }
  } catch (err) {
    console.error("toggleWishlist error:", err);
    return res.json({ success: false, message: "Something went wrong" });
  }
};

export const getWishlistIds = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) return res.json({ ids: [] });
    const wishlist = await Wishlist.findOne({ userId }).lean();
    const ids = wishlist
      ? wishlist.products.map((p) => p.productId.toString())
      : [];
    return res.json({ ids });
  } catch {
    return res.json({ ids: [] });
  }
};

export const addAllToCart = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) return res.json({ success: false, redirect: "/user/login" });

    const wishlist = await Wishlist.findOne({ userId }).lean();
    if (!wishlist || !wishlist.products.length) {
      return res.json({ success: false, message: "Wishlist is empty" });
    }

    const productIds = wishlist.products.map((p) => p.productId);
    const variants = await Variant.find({
      product: { $in: productIds },
      status: "active",
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
          i.variantId.toString() === variant._id.toString(),
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
    console.error("addAllToCart error:", err);
    return res.json({ success: false, message: "Something went wrong" });
  }
};

const CART_MAX_QTY = 7;

async function buildCartView(cart) {
  if (!cart || !cart.items.length) {
    return { isEmpty: true, cartItems: [], subtotal: 0 };
  }

  await cart.populate([
    {
      path: "items.productId",
      select: "name images status deleted_at",
      populate: { path: "brand", select: "name" },
    },
    {
      path: "items.variantId",
      select: "salePrice price stock images status deleted_at",
    },
  ]);

  const cartItems = [];
  let subtotal = 0;
  let cartWasChanged = false;

  for (const item of cart.items) {
    const product = item.productId;
    const variant = item.variantId;

    if (!product || product.status !== "active" || product.deleted_at) continue;
    if (!variant || variant.status !== "active" || variant.deleted_at) continue;

    const isOutOfStock = (variant.stock ?? 0) <= 0;

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
    const total = price * qty;

    if (!isOutOfStock) subtotal += total;

    cartItems.push({
      id: item._id.toString(),
      productId: product._id.toString(),
      variantId: variant._id.toString(),
      brand: product.brand?.name || "TYMORA",
      name: product.name,
      img: variant.images?.[0] || product.images?.[0] || "",
      price,
      qty,
      total: isOutOfStock ? 0 : total,
      stock: variant.stock ?? 0,
      isOutOfStock,
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
    const cart = await Cart.findOne({ userId: req.session.user.id });
    const data = await buildCartView(cart);
    res.render("user/cart", {
      layout: "main",
      user: req.session.user,
      ...data,
    });
  } catch (err) {
    console.error("loadCart error:", err);
    res.render("user/cart", {
      layout: "main",
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

    if (!userId) return res.json({ success: false, redirect: "/user/login" });
    if (!productId || !variantId)
      return res.json({
        success: false,
        message: "Missing product or variant",
      });

    const variant = await Variant.findOne({
      _id: variantId,
      product: productId,
      status: "active",
      deleted_at: null,
    });
    if (!variant)
      return res.json({ success: false, message: "Variant not found" });
    if (variant.stock <= 0)
      return res.json({ success: false, message: "Out of stock" });

    const product = await Product.findOne({
      _id: productId,
      status: "active",
      deleted_at: null,
    });
    if (!product)
      return res.json({ success: false, message: "Product not available" });

    let cart = await Cart.findOne({ userId });
    if (!cart) cart = new Cart({ userId, items: [] });

    const existing = cart.items.find(
      (i) =>
        i.productId.toString() === productId &&
        i.variantId.toString() === variantId,
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
    return res.json({ success: true, message: "Added to cart", cartCount });
  } catch (err) {
    console.error("addToCart error:", err);
    return res.json({ success: false, message: "Something went wrong" });
  }
};

export const updateCartItem = async (req, res) => {
  try {
    const { itemId, quantity } = req.body;
    const userId = req.session.user?.id;
    const qty = Number(quantity);

    if (qty < 1)
      return res.json({ success: false, message: "Invalid quantity" });

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.json({ success: false, message: "Cart not found" });

    const item = cart.items.id(itemId);
    if (!item) return res.json({ success: false, message: "Item not found" });

    const variant = await Variant.findOne({
      _id: item.variantId,
      status: "active",
      deleted_at: null,
    });
    if (!variant)
      return res.json({
        success: false,
        message: "Variant no longer available",
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
    console.error("updateCartItem error:", err);
    return res.json({ success: false, message: "Something went wrong" });
  }
};

export const removeCartItem = async (req, res) => {
  try {
    const { itemId } = req.body;
    const userId = req.session.user?.id;

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.json({ success: false, message: "Cart not found" });

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
    console.error("removeCartItem error:", err);
    return res.json({ success: false, message: "Something went wrong" });
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
      status: "active",
      deleted_at: null,
    })
      .populate("category", "is_visible deleted_at")
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
      status: "active",
      deleted_at: null,
    });

    if (!variantExists) {
      return res.json({ active: false });
    }

    return res.json({ active: true });
  } catch (err) {
    console.error("checkProductStatus error:", err);
    return res.json({ active: false });
  }
};


