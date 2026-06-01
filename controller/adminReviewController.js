import Review from "../model/reviewModel.js";
import Product from "../model/productModel.js";
import mongoose from "mongoose";
import { updateProductRating } from "./reviewController.js";

export const loadAdminReviews = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const search = req.query.search || "";
    const filter = req.query.filter || "all";
    const sort = req.query.sort || "latest";

    // 1. Build Match Query
    let matchQuery = {};

    // Apply Filter
    if (filter === "visible") matchQuery.isVisible = true;
    else if (filter === "hidden") matchQuery.isVisible = false;
    else if (filter === "featured") matchQuery.isFeatured = true;
    else if (filter === "5star") matchQuery.rating = 5;
    else if (filter === "4star") matchQuery.rating = 4;
    else if (filter === "3star") matchQuery.rating = 3;
    else if (filter === "2star") matchQuery.rating = 2;
    else if (filter === "1star") matchQuery.rating = 1;

    // Search (needs population first for user/product, handled in pipeline)
    
    // 2. Sort Logic
    let sortQuery = { createdAt: -1 };
    if (sort === "oldest") sortQuery = { createdAt: 1 };
    else if (sort === "highest") sortQuery = { rating: -1, createdAt: -1 };
    else if (sort === "lowest") sortQuery = { rating: 1, createdAt: -1 };

    // 3. Analytics Aggregation (run before pagination)
    const statsPipeline = [
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ["$isVisible", true] }, 1, 0] } },
          hidden: { $sum: { $cond: [{ $eq: ["$isVisible", false] }, 1, 0] } },
          featured: { $sum: { $cond: [{ $eq: ["$isFeatured", true] }, 1, 0] } },
          avgRating: { $avg: "$rating" },
          positiveCount: { $sum: { $cond: [{ $gte: ["$rating", 4] }, 1, 0] } }
        }
      }
    ];

    const statsResult = await Review.aggregate(statsPipeline);
    const stats = statsResult[0] || { total: 0, active: 0, hidden: 0, featured: 0, avgRating: 0, positiveCount: 0 };
    
    // Format stats
    stats.avgRating = stats.avgRating.toFixed(1);
    stats.positivePercentage = stats.total > 0 ? Math.round((stats.positiveCount / stats.total) * 100) : 0;

    // We also need most reviewed product (simple approximation)
    const topProductAggr = await Review.aggregate([
      { $group: { _id: "$productId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 },
      { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "prod" } }
    ]);
    stats.mostReviewedProduct = topProductAggr.length && topProductAggr[0].prod.length ? topProductAggr[0].prod[0].productName : "N/A";

    // 4. Data Aggregation Pipeline (with search)
    const pipeline = [
      { $match: matchQuery },
      { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
      { $unwind: "$user" },
      { $lookup: { from: "products", localField: "productId", foreignField: "_id", as: "product" } },
      { $unwind: "$product" }
    ];

    if (search) {
      const searchRegex = new RegExp(search, "i");
      pipeline.push({
        $match: {
          $or: [
            { "user.name": searchRegex },
            { "user.email": searchRegex },
            { "product.productName": searchRegex },
            { orderId: searchRegex },
            { reviewText: searchRegex }
          ]
        }
      });
    }

    pipeline.push(
      { $sort: sortQuery },
      { $facet: {
          metadata: [{ $count: "total" }],
          data: [ { $skip: skip }, { $limit: limit } ]
      }}
    );

    const result = await Review.aggregate(pipeline);
    const reviewsData = result[0].data;
    const totalItems = result[0].metadata[0]?.total || 0;
    const totalPages = Math.ceil(totalItems / limit) || 1;

    // Formatting date
    const fmtDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    
    const formattedReviews = reviewsData.map(r => ({
      ...r,
      dateFormatted: fmtDate(r.createdAt),
      userName: r.user.name,
      userEmail: r.user.email,
      userImage: r.user.avatar || r.user.image || "/image/useravathar.png",
      productName: r.product.productName,
      productImage: r.product.productImage ? r.product.productImage[0] : "",
      categoryName: r.product.category || "General",
      // Calculate filled vs empty stars for frontend
      stars: Array.from({ length: 5 }, (_, i) => i < r.rating)
    }));

    res.render("admin/reviewManagement", {
      activePage: "reviews",
      reviews: formattedReviews,
      stats,
      currentPage: page,
      totalPages,
      search,
      filter,
      sort
    });

  } catch (err) {
    console.error("loadAdminReviews error:", err);
    res.status(500).send("Server Error");
  }
};

export const toggleReviewStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'visibility' or 'featured'

    const review = await Review.findById(id);
    if (!review) return res.status(404).json({ success: false, message: "Review not found" });

    if (action === "visibility") {
      review.isVisible = !review.isVisible;
      await review.save();
      await updateProductRating(review.productId);
      return res.json({ success: true, message: review.isVisible ? "Review is now visible" : "Review hidden successfully", isVisible: review.isVisible });
    } else if (action === "featured") {
      review.isFeatured = !review.isFeatured;
      await review.save();
      return res.json({ success: true, message: review.isFeatured ? "Review marked as featured" : "Review removed from featured", isFeatured: review.isFeatured });
    }

    res.status(400).json({ success: false, message: "Invalid action" });
  } catch (err) {
    console.error("toggleReviewStatus error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const review = await Review.findByIdAndDelete(id);
    if (!review) return res.status(404).json({ success: false, message: "Review not found" });

    await updateProductRating(review.productId);
    
    res.json({ success: true, message: "Review deleted successfully" });
  } catch (err) {
    console.error("deleteReview error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// End of file
