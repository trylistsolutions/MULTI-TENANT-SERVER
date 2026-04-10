const mongoose = require('mongoose');
const { getArobiscaSmsDB } = require('../config/db');

const arobiscaSmsConnection = getArobiscaSmsDB();
const arobiscaSmsModel = (name, schema, collection) => {
  if (!schema) {
    return arobiscaSmsConnection.model(name);
  }

  return arobiscaSmsConnection.models[name] || arobiscaSmsConnection.model(name, schema, collection);
};

const feedbackSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    studentAdmissionNumber: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['review', 'comment', 'complaint', 'suggestion', 'inquiry'],
        required: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    isMarkedRead: {
        type: Boolean,
        default: false
    },
    isAdminResponded: {
        type: Boolean,
        default: false
    },
    adminResponse: {
        type: String,
        trim: true
    },
    respondedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Staff'
    },
    respondedAt: {
        type: Date
    },
    markedReadAt: {
        type: Date
    },
    markedReadBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Staff'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: function() {
            return this.type === 'complaint' ? 'high' : 'medium';
        }
    },
    // Student notification tracking
    studentHasSeen: {
        type: Boolean,
        default: true // True when first created, false when admin responds/marks as read
    },
    lastNotificationSentAt: {
        type: Date
    },
    // Track if this feedback has triggered a notification
    hasNotificationUpdate: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Indexes for better query performance
feedbackSchema.index({ studentAdmissionNumber: 1, createdAt: -1 });
feedbackSchema.index({ isMarkedRead: 1, isAdminResponded: 1 });
feedbackSchema.index({ studentHasSeen: 1, hasNotificationUpdate: 1 });

// Middleware to handle notification updates
feedbackSchema.pre('save', function(next) {
    // If admin marks as read or responds, create notification for student
    if (this.isModified('isMarkedRead') || this.isModified('isAdminResponded')) {
        if (this.isMarkedRead || this.isAdminResponded) {
            this.studentHasSeen = false;
            this.hasNotificationUpdate = true;
            this.lastNotificationSentAt = new Date();
        }
    }
    next();
});

module.exports = arobiscaSmsModel('Feedback', feedbackSchema);