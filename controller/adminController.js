import Admin from "../model/adminModel.js";
import User from "../model/userModel.js";
import bcrypt from "bcryptjs";
import { sendOtpMail } from "../services/mailService.js";

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
    req.session.admin = admin._id;

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
  req.session.destroy();
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

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    req.session.resetEmail = email;
    req.session.resetOtp = otp;
    req.session.resetOtpExpiry = Date.now() + 60 * 1000;

    await req.session.save();

    await sendOtpMail(email, otp);

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
    req.session.resetOtp = null;
    req.session.resetOtpExpiry = null;
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
    const limit = 5;
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

    const totalUsers = await User.countDocuments(query);

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
  await User.findByIdAndUpdate(req.params.id, { isBlocked: true });
  res.redirect("/admin/users");
};

export const unblockUser = async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, { isBlocked: false });
  res.redirect("/admin/users");
};

export const deleteUser = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.redirect("/admin/users");
  } catch (err) {
    console.log(err);
    res.redirect("/admin/users");
  }
};
