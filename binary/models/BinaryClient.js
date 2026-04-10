const mongoose = require('mongoose');

const { Schema } = mongoose;

const serviceSchema = new Schema(
  {
    serviceName: {
      type: String,
      required: true,
      trim: true
    },
    serviceCategory: {
      type: String,
      trim: true,
      default: ''
    },
    paymentType: {
      type: String,
      enum: ['one-time', 'subscription'],
      required: true
    },
    startDate: {
      type: Date,
      required: true
    },
    completeDate: {
      type: Date
    },
    renewDate: {
      type: Date
    },
    cycleLength: {
      type: String,
      enum: ['MONTHLY', 'YEARLY'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'paused', 'completed', 'cancelled'],
      default: 'pending'
    },
    developerDetails: {
      type: String,
      trim: true,
      default: ''
    },
    monthlyCost: {
      type: Number,
      min: 0,
      default: 0
    },
    setupCost: {
      type: Number,
      min: 0,
      default: 0
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      default: 'KES'
    },
    pesapalAccountNumber: {
      type: String,
      trim: true,
      default: ''
    },
    autoBillingEnabled: {
      type: Boolean,
      default: false
    },
    autoBillingActivatedAt: {
      type: Date
    },
    pesapalRecurringId: {
      type: String,
      trim: true,
      default: ''
    },
    pesapalRecurringStatus: {
      type: String,
      trim: true,
      default: ''
    },
    paymentHistory: {
      type: [
        new Schema(
          {
            date: { type: Date, required: true },
            amount: { type: Number, required: true },
            currency: { type: String, trim: true, uppercase: true, default: 'KES' },
            method: { type: String, trim: true, default: '' },
            pesapalOrderTrackingId: { type: String, trim: true, default: '' },
            pesapalMerchantReference: { type: String, trim: true, default: '' },
            confirmationCode: { type: String, trim: true, default: '' },
            status: { type: String, enum: ['success', 'failed', 'pending', 'reversed'], default: 'pending' },
            description: { type: String, trim: true, default: '' }
          },
          { _id: true }
        )
      ],
      default: []
    },
    invoices: {
      type: [
        new Schema(
          {
            period: { type: String, required: true }, // "01"-"12" for MONTHLY, "2025"-"2036" for YEARLY
            dueDate: { type: Date, required: true },
            amount: { type: Number, required: true },
            status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
            paidYears: { type: [Number], default: [] }, // Years paid (e.g., [2024, 2025]) for MONTHLY; or [2025, 2026] for YEARLY
            emailSent: { type: Boolean, default: false },
            smsSent: { type: Boolean, default: false }
          },
          { _id: true }
        )
      ],
      default: []
    }
  },
  { _id: true }
);

const mpesaNumberSchema = new Schema(
  {
    phoneNumber: {
      type: String,
      trim: true,
      default: ''
    },
    mpesaName: {
      type: String,
      trim: true,
      default: ''
    },
    label: {
      type: String,
      trim: true,
      default: ''
    },
    active: {
      type: Boolean,
      default: true
    }
  },
  { _id: true }
);

const tillNumberSchema = new Schema(
  {
    tillNumber: {
      type: String,
      trim: true,
      default: ''
    },
    shortCode: {
      type: String,
      trim: true,
      default: ''
    },
    consumerSecret: {
      type: String,
      trim: true,
      default: ''
    },
    consumerKey: {
      type: String,
      trim: true,
      default: ''
    },
    passkey: {
      type: String,
      trim: true,
      default: ''
    },
    label: {
      type: String,
      trim: true,
      default: ''
    },
    active: {
      type: Boolean,
      default: true
    }
  },
  { _id: true }
);

const cardSchema = new Schema(
  {
    label: {
      type: String,
      trim: true,
      default: ''
    },
    holderName: {
      type: String,
      trim: true,
      default: ''
    },
    brand: {
      type: String,
      trim: true,
      default: ''
    },
    last4: {
      type: String,
      trim: true,
      default: ''
    },
    expiryMonth: {
      type: Number,
      min: 1,
      max: 12
    },
    expiryYear: {
      type: Number,
      min: 2000
    },
    active: {
      type: Boolean,
      default: true
    }
  },
  { _id: true }
);

const clientSchema = new Schema(
  {
    clientName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180
    },
    businessName: {
      type: String,
      trim: true,
      default: ''
    },
    address: {
      country: {
        type: String,
        trim: true,
        default: ''
      },
      county: {
        type: String,
        trim: true,
        default: ''
      },
      city: {
        type: String,
        trim: true,
        default: ''
      },
      street: {
        type: String,
        trim: true,
        default: ''
      },
      building: {
        type: String,
        trim: true,
        default: ''
      }
    },
    contact: {
      phone: {
        type: String,
        required: true,
        trim: true
      },
      email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
      },
      secondaryEmail: {
        type: String,
        trim: true,
        lowercase: true,
        default: ''
      },
      secondaryPhone: {
        type: String,
        trim: true,
        default: ''
      },
      website: {
        type: String,
        trim: true,
        default: ''
      }
    },
    paymentMethod: {
      type: String,
      enum: ['', 'MPESA', 'CARD', 'MIXED'],
      default: ''
    },
    paymentProfiles: {
      mpesaNumbers: {
        type: [mpesaNumberSchema],
        default: []
      },
      tillNumbers: {
        type: [tillNumberSchema],
        default: []
      },
      cards: {
        type: [cardSchema],
        default: []
      }
    },
    services: {
      type: [serviceSchema],
      default: []
    },
    totalLifetimeValue: {
      type: Number,
      min: 0,
      default: 0
    },
    accountStatus: {
      type: String,
      enum: ['lead', 'active', 'inactive', 'archived'],
      default: 'lead'
    },
    assignedManager: {
      type: String,
      trim: true,
      default: ''
    },
    tags: {
      type: [String],
      default: []
    },
    notes: {
      type: String,
      trim: true,
      default: ''
    },
    lastContactedAt: {
      type: Date
    },
    pesapalAccountNumber: {
      type: String,
      trim: true,
      default: ''
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

clientSchema.index({ clientName: 1 });
clientSchema.index({ 'contact.email': 1 });
clientSchema.index({ accountStatus: 1, createdAt: -1 });

const getBinaryClientModel = (connection) => {
  return connection.models.BinaryClient || connection.model('BinaryClient', clientSchema, 'binary_clients');
};

module.exports = {
  getBinaryClientModel
};
