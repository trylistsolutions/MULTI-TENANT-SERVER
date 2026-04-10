const mongoose = require('mongoose');
const { getCoffeeDB } = require('../config/db');

const coffeeConnection = getCoffeeDB();
const coffeeModel = (name, schema, collection) => {
  if (!schema) {
    return coffeeConnection.model(name);
  }

  return coffeeConnection.models[name] || coffeeConnection.model(name, schema, collection);
};

const couponSchema = new mongoose.Schema({
  couponCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  discountType: {
    type: String,
    enum: ['fixed', 'percentage'],
    required: true
  },
  discountAmount: {
    type: Number,
    required: true,
    min: 0
  },
  minimumPurchaseAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  endDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  applicableCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  applicableProduct: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    default: null
  }
}, { 
  timestamps: true 
});

// Add index for better performance
couponSchema.index({ couponCode: 1 });
couponSchema.index({ endDate: 1 });
couponSchema.index({ status: 1 });

const Coupon = coffeeModel('Coupon', couponSchema);

module.exports = Coupon;