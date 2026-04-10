// Applications Model - Stores student application data
const mongoose = require('mongoose');

// Define schema
const applicationSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
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
  phone: {
    type: String,
    required: true,
    trim: true
  },
  dateOfBirth: {
    type: Date,
    required: true
  },
  gender: {
    type: String,
    required: true
  },
  qualification: {
    type: String,
    required: true,
    trim: true
  },
  preferredIntake: {
    type: String,
    required: true,
    trim: true
  },
  course: {
    type: String,
    required: true,
    trim: true
  },
  citizenship: {
    type: String,
    required: true,
    trim: true
  },
  idNumber: {
    type: String,
    required: true,
    trim: true
  },
  howHeardAbout: {
    type: [String],
    required: true
  },
  otherSource: {
    type: String,
    trim: true
  },
  trainingMode: {
    type: String,
    required: true,
    trim: true
  },
  preferredStartDate: {
    type: String,
    required: true
  },
  kcseGrade: {
    type: String,
    required: true,
    trim: true
  },
  feePayer: {
    type: String,
    required: true,
    trim: true
  },
  feePayerPhone: {
    type: String,
    required: true,
    trim: true
  },
  nextOfKinName: {
    type: String,
    required: true,
    trim: true
  },
  nextOfKinRelationship: {
    type: String,
    required: true,
    trim: true
  },
  nextOfKinPhone: {
    type: String,
    required: true,
    trim: true
  },
  agreedToTerms: {
    type: Boolean,
    required: true
  },
  applicationNumber: {
    type: String,
    unique: true,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  adminNotes: {
    type: [
      {
        note: String,
        admin: String,
        fromStatus: String,
        toStatus: String,
        createdAt: { type: Date, default: Date.now }
      }
    ],
    default: []
  },
  emailSent: {
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
});

// Create model
const Application = mongoose.model('Application', applicationSchema);

module.exports = Application;
