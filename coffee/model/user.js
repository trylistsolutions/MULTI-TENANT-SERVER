const mongoose = require('mongoose');
const { getCoffeeDB } = require('../config/db');

const coffeeConnection = getCoffeeDB();
const coffeeModel = (name, schema, collection) => {
  if (!schema) {
    return coffeeConnection.model(name);
  }

  return coffeeConnection.models[name] || coffeeConnection.model(name, schema, collection);
};

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    match: [/^[^@]+@[^@]+\.[^@]+$/, 'Please enter a valid email address']
  },
  phoneNumber: {
    type: String,
    required: true,
    trim: true,
  },
  password: {
    type: String,
    required: true
  },
  // New fields for account type and business information
  accountType: {
    type: String,
    enum: ['personal', 'business'],
    default: 'personal',
    required: true
  },
  companyName: {
    type: String,
    required: function() {
      return this.accountType === 'business';
    },
    trim: true
  },
  address: {
    type: String,
    required: function() {
      return this.accountType === 'business';
    },
    trim: true
  },
  kraPin: {
    type: String,
    required: function() {
      return this.accountType === 'business';
    },
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  resetCode: {
    type: String,
    required: false
  },
  resetCodeExpiration: {
    type: Date,
    required: false
  },
  verificationCode: {
    type: String,
    required: false
  },
  verificationCodeExpiration: {
    type: Date,
    required: false
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
    required: false
  },
  verificationRequestCount: {
    type: Number,
    default: 0,
    required: false
  },
  lastVerificationRequest: {
    type: Date,
    required: false
  },
  shippingAddresses: {
    type: [
      {
        firstName: { type: String, required: true },
        lastName: { type: String, required: true },
        address: { type: String, required: true },
        apartment: { type: String },
        city: { type: String, required: true },
        postalCode: { type: String, required: true },
      },
    ],
    default: [],
    validate: {
      validator: function (addresses) {
        return addresses.length <= 3
      },
      message: "A user can only have up to 3 shipping addresses.",
    },
  },
  orders: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  }],
});

// Update the updatedAt field before saving
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const User = coffeeModel('User', userSchema);

module.exports = User;