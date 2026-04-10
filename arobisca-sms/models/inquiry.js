const mongoose = require('mongoose');
const { getArobiscaSmsDB } = require('../config/db');

const arobiscaSmsConnection = getArobiscaSmsDB();
const arobiscaSmsModel = (name, schema, collection) => {
  if (!schema) {
    return arobiscaSmsConnection.model(name);
  }

  return arobiscaSmsConnection.models[name] || arobiscaSmsConnection.model(name, schema, collection);
};

const inquirySchema = new mongoose.Schema({
    // Contact Information
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        trim: true,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        trim: true
    },
    
    // Inquiry Details
    subject: {
        type: String,
        required: [true, 'Subject is required'],
        trim: true
    },
    message: {
        type: String,
        required: [true, 'Message is required'],
        trim: true
    },
    
    // Inquiry Type Classification
    inquiryType: {
        type: String,
        enum: ['General', 'Course', 'Admission', 'Partnership', 'Other'],
        default: 'General'
    },
    
    // Status Tracking
    status: {
        type: String,
        enum: ['New', 'In Progress', 'Responded', 'Closed', 'Spam'],
        default: 'New'
    },
    
    // Response Information
    respondedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Staff'
    },
    responseDate: {
        type: Date
    },
    responseNotes: {
        type: String,
        trim: true
    },
    responseMethod: {
        type: String,
        enum: ['Email', 'Phone', 'In Person', 'Other']
    },
    
    // System fields
    inquiryDate: {
        type: Date,
        default: Date.now
    },
    inquiryNumber: {
        type: String,
        unique: true
    },
    source: {
        type: String,
        default: 'Website Contact Form'
    },
    ipAddress: {
        type: String
    },
    
    // Metadata for analytics
    pageUrl: {
        type: String
    },
    userAgent: {
        type: String
    }
}, {
    timestamps: true
});

// Generate inquiry number before saving
inquirySchema.pre('save', async function(next) {
    if (!this.inquiryNumber) {
        const year = new Date().getFullYear();
        const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
        const count = await this.constructor.countDocuments({
            inquiryDate: {
                $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                $lt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
            }
        });
        this.inquiryNumber = `INQ-${year}${month}-${(count + 1).toString().padStart(4, '0')}`;
    }
    
    // Auto-detect inquiry type based on subject/keywords
    if (!this.inquiryType) {
        const subjectLower = this.subject.toLowerCase();
        const messageLower = this.message.toLowerCase();
        
        if (subjectLower.includes('course') || messageLower.includes('course') || 
            subjectLower.includes('class') || messageLower.includes('class')) {
            this.inquiryType = 'Course';
        } else if (subjectLower.includes('admission') || messageLower.includes('admission') || 
                   subjectLower.includes('apply') || messageLower.includes('apply')) {
            this.inquiryType = 'Admission';
        } else if (subjectLower.includes('partner') || messageLower.includes('partner') || 
                   subjectLower.includes('collaborat') || messageLower.includes('collaborat')) {
            this.inquiryType = 'Partnership';
        }
    }
    
    next();
});

// Indexes for better query performance
inquirySchema.index({ email: 1 });
inquirySchema.index({ status: 1 });
inquirySchema.index({ inquiryDate: -1 });
inquirySchema.index({ inquiryType: 1 });
inquirySchema.index({ inquiryNumber: 1 });

const Inquiry = arobiscaSmsModel('Inquiry', inquirySchema);

module.exports = Inquiry;