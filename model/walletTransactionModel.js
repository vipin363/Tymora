import mongoose from 'mongoose';

const walletTransactionSchema = mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },
    type: {
        type: String,
        enum: ['Credit', 'Debit'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    orderId: {
        type: String,
        default: null
    },
    status: {
        type: String,
        enum: ['Pending', 'Success', 'Failed'],
        default: 'Success'
    }
}, { timestamps: true });

export default mongoose.model('WalletTransaction', walletTransactionSchema);
