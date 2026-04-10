const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
    },
    transactionId: {
      type: String,
      required: true,
      unique: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    // New fields to label and track usage of a transaction
    purpose: {
      type: String,
      enum: ['fee_payment', 'course_purchase', 'subscription', 'other'],
      default: 'other',
    },
    purposeMeta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    used: {
      type: Boolean,
      default: false,
    }
  },
  {
    timestamps: true,
  }
);

// Optional: Add indexes if needed
paymentSchema.index({ transactionId: 1 });

// Export model (uses default connection)
module.exports = mongoose.model('MpesaTransaction', paymentSchema);
