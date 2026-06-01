import Referral from "../model/referralModel.js";

export const loadAdminReferrals = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const { search, status, source } = req.query;

    let query = {};

    if (status && status !== 'all') {
      query.rewardStatus = status;
    }

    if (source && source !== 'all') {
      query.referralSource = source;
    }

    if (search) {
      // Allow searching by email or code
      query.$or = [
        { referredEmail: { $regex: search, $options: "i" } },
        { referralCodeUsed: { $regex: search, $options: "i" } }
      ];
    }

    const totalReferrals = await Referral.countDocuments(query);
    const totalPages = Math.ceil(totalReferrals / limit) || 1;

    const referralsList = await Referral.find(query)
      .populate('referrer', 'name email')
      .populate('referredUser', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

    const formattedReferrals = referralsList.map(r => ({
      ...r,
      signupDateFormatted: fmtDate(r.createdAt),
      rewardDateFormatted: fmtDate(r.rewardReleaseDate),
      referrerName: r.referrer?.name || "Unknown",
      referredName: r.referredUser?.name || "Unknown",
      totalRewardValue: r.referrerRewardAmount + r.referredRewardAmount
    }));

    res.render("admin/referralManagement", {
      activePage: "referrals",
      referrals: formattedReferrals,
      currentPage: page,
      totalPages,
      search: search || "",
      statusFilter: status || "all",
      sourceFilter: source || "all",
      stats: {
        total: await Referral.countDocuments(),
        pending: await Referral.countDocuments({ rewardStatus: "PENDING" }),
        completed: await Referral.countDocuments({ rewardStatus: "COMPLETED" })
      }
    });

  } catch (err) {
    console.error("loadAdminReferrals error:", err);
    res.redirect("/admin/dashboard");
  }
};
