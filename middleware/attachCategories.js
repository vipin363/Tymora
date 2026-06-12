import Category from "../model/categoryModel.js";

export const attachCategories = async (req, res, next) => {
  try {
    const categories = await Category.find({
      is_visible: true,
      deleted_at: null,
    }).sort({ createdAt: -1 }).lean();

    res.locals.navCategories = categories.map(c => ({
      _id:  c._id,
      name: c.name,
      image: c.image_url || "",
    }));

    res.locals.user = req.session.user || null;

      
    req.session.cartCount = req.session.cartCount !== undefined ? req.session.cartCount : 2;
    res.locals.cartCount = req.session.cartCount;

  } catch (err) {
    res.locals.navCategories = [];
    res.locals.user = null;
  }
  next();
};