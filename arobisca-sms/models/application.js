const mongoose = require('mongoose');
const { getArobiscaSmsDB } = require('../config/db');

const arobiscaSmsConnection = getArobiscaSmsDB();
const arobiscaSmsModel = (name, schema, collection) => {
  if (!schema) {
    return arobiscaSmsConnection.model(name);
  }

  return arobiscaSmsConnection.models[name] || arobiscaSmsConnection.model(name, schema, collection);
};
const YearlyApplicationCounter = require('./YearlyApplicationCounter');

const applicationSchema = new mongoose.Schema({
    // Personal Information
    firstName: {
        type: String,
        required: [true, 'First name is required'],
        trim: true
    },
    lastName: {
        type: String,
        required: [true, 'Last name is required'],
        trim: true
    },
    dateOfBirth: {
        type: Date,
        required: [true, 'Date of birth is required']
    },
    gender: {
        type: String,
        enum: ['Male', 'Female'],
        required: [true, 'Gender is required']
    },
    religion: {
        type: String,
        trim: true
    },
    nationality: {
        type: String,
        required: [true, 'Nationality is required'],
        trim: true
    },

    // Contact Information
    email: {
        type: String,
        required: [true, 'Email is required'],
        trim: true,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
    },
    marketingConsent: {
        type: Boolean,
        default: false
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        trim: true
    },
    idPassport: {
        type: String,
        required: [true, 'ID/Passport number is required'],
        trim: true,
        unique: true
    },

    // Course Information
    course: {
        type: String,
        required: [true, 'Course selection is required'],
        trim: true
    },
    preferredStartDate: {
        type: Date,
        required: [true, 'Preferred start date is required']
    },
    preferredClassTime: {
        type: String,
        enum: ['Morning Classes', 'Afternoon Classes', 'Evening Classes', 'Flexible'],
        required: [true, 'Preferred class time is required']
    },

    // Emergency Contact
    emergencyContact: {
        firstName: {
            type: String,
            required: [true, 'Emergency contact first name is required'],
            trim: true
        },
        lastName: {
            type: String,
            required: [true, 'Emergency contact last name is required'],
            trim: true
        },
        relation: {
            type: String,
            required: [true, 'Emergency contact relation is required'],
            trim: true
        },
        phone: {
            type: String,
            required: [true, 'Emergency contact phone is required'],
            trim: true
        }
    },

    // Additional Information
    additionalInfo: {
        type: String,
        trim: true
    },

    // Application Status
    status: {
        type: String,
        default: 'Pending'
    },
    rejectionReason: {
        type: String,
    },

    // Application Metadata
    applicationDate: {
        type: Date,
        default: Date.now
    },
    applicationNumber: {
        type: String,
        unique: true
    },

    // Processing Information
    reviewedBy: {
        type: String,
    },
    reviewDate: {
        type: Date
    },
    reviewNotes: {
        type: String,
        trim: true
    },

    // System fields
    isArchived: {
        type: Boolean,
        default: false
    },
    source: {
        type: String,
        default: 'Website Form'
    },

    // Email tracking
    emailSent: {
        confirmation: {
            type: Boolean,
            default: false
        },
        confirmationDate: Date,
        adminNotification: {
            type: Boolean,
            default: false
        },
        adminNotificationDate: Date
    },

    // Request metadata
    ipAddress: String,
    userAgent: String,
    source: String,
}, {
    timestamps: true
});

// Generate application number before saving
applicationSchema.pre('save', async function (next) {
    if (!this.applicationNumber) {
        // Get the next sequential application number for this year
        this.applicationNumber = await YearlyApplicationCounter.getNextApplicationNumber();
    }
    next();
});

// Indexes for better query performance
applicationSchema.index({ email: 1 });
applicationSchema.index({ phone: 1 });
applicationSchema.index({ status: 1 });
applicationSchema.index({ applicationDate: -1 });
applicationSchema.index({ course: 1 });

const Application = arobiscaSmsModel('Application', applicationSchema);

module.exports = Application;