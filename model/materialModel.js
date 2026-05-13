import mongoose from 'mongoose';

const materialSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  type: { type: String, enum: ['strap', 'case', 'both'], default: 'both' },
}, { timestamps: true });

export default mongoose.model('Material', materialSchema);