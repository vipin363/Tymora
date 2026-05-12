import mongoose from "mongoose";

const addressSchema = new mongoose.Schema({

  userId:{
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true
  },

  type: {
     type: String,
     enum: ["Home", "Work"],
     required: true
  },
  fullName: {
    type: String,
    required: true
  },

  street: {
    type: String,
    required: true
  },

   city: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true
  },

  pincode: {
    type: String,
    required: true
  },

  phone: {
    type: String,
    required: true
  },

  isDefault:{
    type: Boolean,
    default: false
  }

}, { timestamps: true });

export default mongoose.model("address", addressSchema);

