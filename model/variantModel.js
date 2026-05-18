import mongoose from "mongoose";

const variantSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    name: { type: String, required: true },
    sku: { type: String, unique: true, sparse: true },
    strapColor: { type: String },
    dialColor: { type: String },
    caseColor: { type: String },
    size: { type: String },
    strapMaterial: { type: String },
    caseMaterial: { type: String },
    originalPrice: { type: Number, required: true, min: 0 },
    salePrice: { type: Number, required: true, min: 0 },
    discountPercentage: { type: Number, default: 0 },
    price: { type: Number, required: true },
    stock: { type: Number, default: 0 },
    images: [String],
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    offerProduct: { type: Boolean, default: false },
    isDefault: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
    variantStatusBeforeInactive: {
      type: String,
      enum: ["active", "inactive", null],
      default: null,
    },
  },
  { timestamps: true },
);

variantSchema.pre("save", async function () {
  if (this.originalPrice > 0) {
    this.discountPercentage = Math.max(
      0,
      Math.round(
        ((this.originalPrice - this.salePrice) / this.originalPrice) * 100,
      ),
    );
  } else {
    this.discountPercentage = 0;
  }
  this.price = this.salePrice;
});

variantSchema.pre("findOneAndUpdate", async function () {
  const update = this.getUpdate();
  const op = update.$set || update;
  const originalPrice = parseFloat(op.originalPrice);
  const salePrice = parseFloat(op.salePrice);
  if (!isNaN(originalPrice) && !isNaN(salePrice) && originalPrice > 0) {
    const pct = Math.max(
      0,
      Math.round(((originalPrice - salePrice) / originalPrice) * 100),
    );
    if (update.$set) {
      update.$set.discountPercentage = pct;
      update.$set.price = salePrice;
    } else {
      update.discountPercentage = pct;
      update.price = salePrice;
    }
  }
});

export default mongoose.model("Variant", variantSchema);
