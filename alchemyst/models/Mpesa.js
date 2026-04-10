const mongoose = require('mongoose');
const { getAlchemystDB } = require('../config/db');

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
    }
  },
  {
    timestamps: true,
  }
);

// Optional: Add indexes if needed
paymentSchema.index({ transactionId: 1 });

const alchemystConnection = getAlchemystDB();
module.exports =
  alchemystConnection.models.MpesaTransaction ||
  alchemystConnection.model('MpesaTransaction', paymentSchema);
