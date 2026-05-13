import mongoose from 'mongoose';

const savedColorSchema = new mongoose.Schema({
  hex: { type: String, required: true },
  name: { type: String },
  usedCount: { type: Number, default: 1 },
}, { timestamps: true });

export default mongoose.model('SavedColor', savedColorSchema);