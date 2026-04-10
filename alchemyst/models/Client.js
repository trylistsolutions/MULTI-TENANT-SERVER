const mongoose = require('mongoose');
const { getAlchemystDB } = require('../config/db');

const clientSchema = new mongoose.Schema({
  // Authentication fields
  username: {
    type: String,
    trim: true,
    lowercase: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  password: {
    type: String
  },

  // Profile fields
  profile: {
    firstName: String,
    lastName: String,
    phone: String,
    bio: String,
    profilePicture: String,
    dateOfBirth: Date
  },

  // Client-specific fields
  preferences: {
    services: [String],
    locations: [String],
    budgetRange: {
      min: Number,
      max: Number
    }
  },

  // Account status
  isActive: {
    type: Boolean,
    default: false
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  // Email verification
  emailVerificationCode: String,
  emailVerificationExpires: Date,

   wallet: {
    balance: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'KES'
    }
  },
  
  // Payment history
  paymentHistory: [{
    transactionId: String,
    checkoutRequestId: String,
    amount: Number,
    phone: String,
    type: {
      type: String,
      enum: ['deposit', 'withdrawal', 'payment'],
      default: 'deposit'
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'completed'
    },
    description: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],

    // Profile image
  profileImage: {
    url: String,
    profilePicPublicId: String
  },

  // Gallery images (secondary photos)
  secondaryImages: [{
    url: String,
    publicId: String,
    width: Number,
    height: Number,
    format: String,
    bytes: Number,
    createdAt: String
  }],

  
  // Gallery images (secondary photos)
  secondaryImages: [{
    url: String,
    publicId: String,
    width: Number,
    height: Number,
    format: String,
    bytes: Number,
    createdAt: String
  }],
  
currentPackage: {
  packageType: {
    type: String,
    enum: ['basic', 'premium', 'elite'],
    default: null
  },
  durationType: {
    type: String,
    enum: ['weekly', 'monthly'],
    default: null
  },
  totalCost: Number,
  purchaseDate: Date,
  expiryDate: Date,
  status: {
    type: String,
    enum: ['active', 'expired', 'cancelled'],
    default: 'active'
  },
  autoRenew: {
    type: Boolean,
    default: false
  },
  autoRenewDurationType: {
    type: String,
    enum: ['weekly', 'monthly'],
    default: null
  }
},

// Keep package history for tracking
packageHistory: [{
  packageType: String,
  durationType: String,
  totalCost: Number,
  purchaseDate: Date,
  expiryDate: Date,
  action: {
    type: String,
    enum: ['subscribe', 'upgrade', 'renew', 'auto-renew', 'expire', 'cancel']
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}],
  
  // Track processed transactions to prevent duplicates
  processedTransactions: [String],

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
clientSchema.index({ email: 1 });
clientSchema.index({ username: 1 });

const alchemystConnection = getAlchemystDB();
module.exports = alchemystConnection.models.Client || alchemystConnection.model('Client', clientSchema);