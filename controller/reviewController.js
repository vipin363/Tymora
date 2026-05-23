
import Review from "../model/reviewModel.js";
import Order from "../model/orderModel.js";


export const addReview = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const { productId, orderId, rating, reviewText } = req.body;
    if (!rating || !reviewText) return res.status(400).json({ success: false, message: "Rating and review text are required." });
    if (reviewText.length < 5) return res.status(400).json({ success: false, message: "Review must be at least 5 characters." });

    
    const order = await Order.findOne({ orderId, userId });
    if (!order || order.orderStatus !== "Delivered") {
      return res.status(400).json({ success: false, message: "You can only review products after the order is delivered." });
    }

   
    const hasProduct = order.products.some(p => p.productId.toString() === productId);
    if (!hasProduct) return res.status(400).json({ success: false, message: "Product not found in this order." });

    const existingReview = await Review.findOne({ productId, userId, orderId });
    if (existingReview) {
      return res.status(400).json({ success: false, message: "You have already reviewed this product for this order." });
    }

    const review = new Review({ productId, userId, orderId, rating: Number(rating), reviewText });
    await review.save();

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

    if (!rating || !reviewText || reviewText.length < 5) {
      return res.status(400).json({ success: false, message: "Invalid review data." });
    }

    const review = await Review.findOneAndUpdate(
      { _id: reviewId, userId },
      { rating: Number(rating), reviewText },
      { new: true }
    );

    if (!review) return res.status(404).json({ success: false, message: "Review not found" });

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

