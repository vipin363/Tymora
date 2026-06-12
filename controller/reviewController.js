
import Review from "../model/reviewModel.js";
import Order from "../model/orderModel.js";
import Product from "../model/productModel.js";

export const updateProductRating = async (productId) => {
  try {
    const reviews = await Review.find({ productId, isVisible: true });
    const numReviews = reviews.length;
    let avgRating = 0;
    if (numReviews > 0) {
      const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
      avgRating = (sum / numReviews).toFixed(1);
    }
    await Product.findByIdAndUpdate(productId, { rating: avgRating, reviews: numReviews });
  } catch (error) {
    console.error("Error updating product rating:", error);
  }
};


export const addReview = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const { productId, orderId, rating, reviewText } = req.body;
    if (!rating || !reviewText) return res.status(400).json({ success: false, message: "Rating and review text are required." });
    if (reviewText.trim().length < 3 || !/[A-Za-z]/.test(reviewText)) {
      return res.status(400).json({ success: false, message: "Review must contain at least 3 characters and include letters." });
    }

    
    const order = await Order.findOne({ orderId, userId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    const productItem = order.products.find(p => p.productId.toString() === productId);
    if (!productItem) return res.status(400).json({ success: false, message: "Product not found in this order." });

    if (productItem.orderStatus !== "Delivered") {
      return res.status(400).json({ success: false, message: "You can only review products after they have been delivered." });
    }

    const existingReview = await Review.findOne({ productId, userId, orderId });
    if (existingReview) {
      return res.status(400).json({ success: false, message: "You have already reviewed this product for this order." });
    }

    const review = new Review({ productId, userId, orderId, rating: Number(rating), reviewText });
    await review.save();

    await updateProductRating(productId);

    res.json({ success: true, message: "Review submitted successfully!" });
  } catch (err) {
    console.error("addReview error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const editReview = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const { reviewId } = req.params;
    const { rating, reviewText } = req.body;

    if (!rating || !reviewText || reviewText.trim().length < 3 || !/[A-Za-z]/.test(reviewText)) {
      return res.status(400).json({ success: false, message: "Invalid review data. Review must contain at least 3 characters and include letters." });
    }

    const review = await Review.findOneAndUpdate(
      { _id: reviewId, userId },
      { rating: Number(rating), reviewText },
      { new: true }
    );

    if (!review) return res.status(404).json({ success: false, message: "Review not found" });

    await updateProductRating(review.productId);

    res.json({ success: true, message: "Review updated successfully!" });
  } catch (err) {
    console.error("editReview error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const deleteReview = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const { reviewId } = req.params;
    const deleted = await Review.findOneAndDelete({ _id: reviewId, userId });

    if (!deleted) return res.status(404).json({ success: false, message: "Review not found" });

    await updateProductRating(deleted.productId);

    res.json({ success: true, message: "Review deleted successfully!" });
  } catch (err) {
    console.error("deleteReview error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getMyReviews = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) return res.redirect("/user/login");

    const reviews = await Review.find({ userId }).populate("productId", "name images").sort({ createdAt: -1 }).lean();

    const formattedReviews = reviews.map(r => ({
      ...r,
      dateFormatted: new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
      productImage: r.productId?.images?.[0] || "",
      productName: r.productId?.name || "Product"
    }));

    res.render("user/myReviews", { layout: "main", reviews: formattedReviews });
  } catch (err) {
    console.error("getMyReviews error:", err);
    res.redirect("/user/home");
  }
};

