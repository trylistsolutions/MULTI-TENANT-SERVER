const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Course name is required'],
    trim: true,
    unique: true,
  },
  description: {
    type: String,
    trim: true,
  },
  
  // Course Classification
  courseType: {
    type: String,
    required: [true, 'Course type is required'],
    default: 'online'
  },
  courseTier: {
    type: String,
    required: [true, 'Course tier is required'],
    default: 'basic'
  },
  
  // Duration
  duration: {
    type: Number,
    required: [true, 'Duration is required'],
    min: [1, 'Duration must be at least 1']
  },
  durationType: {
    type: String,
    required: [true, 'Duration type is required'],
    enum: {
      values: ['hours', 'days', 'weeks', 'months'],
      message: 'Duration type must be hours, days, weeks, or months'
    },
    default: 'months'
  },
  
  // Pricing
  courseFee: {
    type: Number,
    required: [true, 'Course fee is required'],
    min: [0, 'Course fee cannot be negative']
  },
  offerPrice: {
    type: Number,
    min: [0, 'Offer price cannot be negative'],
    default: null,
  },
  
  // Images
  coverImage: {
    url: {
      type: String,
      default: null
    },
    cloudinaryId: {
      type: String,
      default: null
    }
  },
  secondaryImages: [{
    url: {
      type: String,
      required: true
    },
    cloudinaryId: {
      type: String,
      required: true
    },
    order: {
      type: Number,
      default: 0
    }
  }],
  
  // Status and Metadata
  status: {
    type: String,
    default: 'active'
  },
  
  // Future reference to tutors
  tutors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tutor'
  }],

  // Enrolled students
  enrolledStudents: [
    {
      studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String },
      email: { type: String },
      phone: { type: String },
      enrollmentTime: { type: Date, default: Date.now },
      paymentStatus: { type: String, enum: ['PENDING', 'PAID', 'FAILED'], default: 'PENDING' },
      payment: {
        status: { type: String, enum: ['PENDING', 'PAID', 'FAILED'], default: 'PENDING' },
        phone: { type: String, default: null },
        transactionId: { type: String, default: null },
        amount: { type: Number, default: null },
        timeOfPayment: { type: Date, default: null }
      },
      assignmentStatus: { type: String, enum: ['PENDING', 'ASSIGNED', 'CANCELLED'], default: 'PENDING' },
      adminNotes: { type: String, default: '' },
      tutor: {
        id: { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor', default: null },
        name: { type: String, default: null },
        email: { type: String, default: null },
        phone: { type: String, default: null },
        status: { type: String, enum: ['PENDING', 'ASSIGNED', 'CANCELLED'], default: 'PENDING' }
      }
    }
  ],
  
  // Certification
  certificationAvailable: {
    type: Boolean,
    default: false
  },

  // System fields
  isArchived: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});


module.exports = mongoose.model('Course', courseSchema);