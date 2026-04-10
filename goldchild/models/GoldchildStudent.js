const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.Mixed, default: null },
    name: { type: String, default: null, trim: true },
    title: { type: String, default: null, trim: true }
  },
  { _id: false }
);

const goldchildStudentSchema = new mongoose.Schema(
  {
    // Admission Number (unique within Goldchild)
    admissionNumber: {
      type: String,
      unique: true,
      index: true,
      required: true,
      trim: true
    },

    // Reference to Application
    applicationRef: {
      type: String,
      required: true
    },

    // Personal Information (from application)
    personalInformation: {
      firstName: { type: String, required: true, trim: true },
      lastName: { type: String, required: true, trim: true },
      email: { type: String, required: true, trim: true, lowercase: true },
      phoneNumber: { type: String, required: true, trim: true },
      dateOfBirth: { type: String, required: true },
      gender: { type: String, required: true },
      citizenship: { type: String, required: true, trim: true },
      idOrPassportNumber: { type: String, required: true, trim: true }
    },

    // Academic Information (from application)
    academicInformation: {
      highestQualification: { type: String, required: true, trim: true },
      kcseGradeOrEquivalent: { type: String, required: true, trim: true },
      course: { type: courseSchema, required: true },
      modeOfTraining: { type: String, required: true, trim: true }
    },

    // Financial Information (from application)
    financialInformation: {
      feePayerName: { type: String, required: true, trim: true },
      feePayerPhoneNumber: { type: String, required: true, trim: true }
    },

    // Next of Kin (from application)
    nextOfKin: {
      fullName: { type: String, required: true, trim: true },
      relationship: { type: String, required: true, trim: true },
      phoneNumber: { type: String, required: true, trim: true }
    },

    // Discovery Channels (from application)
    discoveryChannels: {
      type: [String],
      default: []
    },

    // Admission Details (from admin admit form)
    startDate: {
      type: Date,
      required: true
    },

    // Course Selection (from admin admit form - from Goldchild courses DB)
    courseId: {
      type: String,
      required: true
    },
    courseName: {
      type: String,
      required: true,
      trim: true
    },
    duration: {
      type: Number,
      required: true
    },
    durationType: {
      type: String,
      enum: ['hours', 'days', 'weeks', 'months'],
      required: true
    },
    courseFee: {
      type: Number,
      required: true
    },

    // Payment Information (from admin admit form)
    upfrontFee: {
      type: Number,
      required: true,
      default: 0
    },

    // Admin Notes (from admin admit form)
    adminNotes: {
      type: String,
      trim: true,
      default: null
    },

    // Status
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'completed'],
      default: 'active',
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

const getGoldchildStudentModel = (connection) => {
  return (
    connection.models.GoldchildStudent ||
    connection.model('GoldchildStudent', goldchildStudentSchema)
  );
};

module.exports = {
  getGoldchildStudentModel
};
