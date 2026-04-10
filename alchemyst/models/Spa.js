const mongoose = require('mongoose');
const { getAlchemystDB } = require('../config/db');

const spaSchema = new mongoose.Schema({
  // 1====================== Authentication fields
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
  userType: {
    type: String,
    required: true
  },
  bio: {
    type: String,
    default: '',
    trim: true,
    maxlength: 500
  },
  serviceType: {
    type: String,
    trim: true
  },
  providesEroticServices: {
    type: Boolean,
    default: false
  },








  //3============ Verification & status
  verification: {
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    profileVerified: {
      type: Boolean,
      default: false
    },
    // ADD THESE FIELDS:
    verificationRequested: {
      type: Boolean,
      default: false
    },
    verificationRequestedAt: {
      type: Date
    },
    verificationStatus: {
      type: String,
      enum: ['not_requested', 'pending', 'approved', 'rejected'],
      default: 'not_requested'
    },
    documents: [String]
  },








  //4=========== Profile image
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






  // 5=========== Subscribed Package
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









  //6============= Account status
  isActive: {
    type: Boolean,
    default: false
  },
  isDeactivated: {
    type: Boolean,
    default: false
  },

  // Email verification
  emailVerificationCode: String,
  emailVerificationExpires: Date,
  loginEmailVerificationCode: String,
  loginEmailVerificationExpires: Date,










  //7============ Wallet and payments
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

  // Track processed transactions to prevent duplicates
  processedTransactions: [String],








  //8================ Location Information (for all user types)
  location: {
    country: {
      type: String,
      default: 'Kenya',
      trim: true
    },
    county: {
      type: String,
      default: '',
      trim: true
    },
    location: {
      type: String,
      default: '',
      trim: true
    },
    area: [{
      type: String,
      default: '',
      trim: true
    }],
  },




  //9================ Contact Information (for all user types)
  contact: {
    phoneNumber: {
      type: String,
      trim: true
    },
    secondaryPhone: {
      type: String,
      trim: true
    },
    hasWhatsApp: {
      type: Boolean,
      default: false
    },
    prefersCall: {
      type: Boolean,
      default: false
    },
    telegramLink: {
      type: String,
      trim: true
    },
    onlyFansLink: {
      type: String,
      trim: true
    },
    isPhoneVerified: {
      type: Boolean,
      default: false
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },







  //10============== Services Information
  services: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500
    },
    price: {
      type: Number,
      min: 0
    },
    pricingUnit: {
      type: String,
      default: 'Per Hour'
    },
    contactForPrice: {
      type: Boolean,
      default: false
    },
    priceNegotiable: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    },
    image: {
      url: String,
      publicId: String,
      width: Number,
      height: Number,
      format: String,
      bytes: Number,
      createdAt: String
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }],













  //11================= Analytics and tracking
  analytics: {
    views: {
      type: Number,
      default: 0
    },
    interactions: {
      type: Number,
      default: 0
    },
    phone_copies: {
      type: Number,
      default: 0
    },
    calls: {
      type: Number,
      default: 0
    },
    whatsapps: {
      type: Number,
      default: 0
    },
    profile_views: {
      type: Number,
      default: 0
    },
    messages: {
      type: Number,
      default: 0
    },
    lastViewed: Date,
    interactionHistory: [{
      type: {
        type: String,
        enum: ['phone_copy', 'call', 'whatsapp', 'profile_view', 'message']
      },
      timestamp: {
        type: Date,
        default: Date.now
      }
    }]
  },




















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
spaSchema.index({ email: 1 });
spaSchema.index({ username: 1 });

const alchemystConnection = getAlchemystDB();
module.exports = alchemystConnection.models.Spa || alchemystConnection.model('Spa', spaSchema);