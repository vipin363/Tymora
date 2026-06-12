import mongoose from "mongoose";

const categorySchema = new mongoose.Schema({

  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },

  short_description: {
    type: String,
    trim: true,
    default: ""
  },

  image_url: {
    type: String,
    default: ""
  },

  quantity_available: {
    type: Number,
    default: 0,
    min: 0
  },

  is_visible: {
    type: Boolean,
    default: true
  },

  deleted_at: {
    type: Date,
    default: null
  }

}, {
  timestamps: {
    createdAt: "created_at",
    updatedAt: "updated_at"
  }
});

categorySchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

const Category = mongoose.model("Category", categorySchema);

export default Category;