const mongoose = require('mongoose');

const goldchildAlumniSchema = new mongoose.Schema(
  {
    // Graduation Reference
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    admissionNumber: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    graduationDate: {
      type: Date,
      required: true,
      default: Date.now
    },
    graduationNotes: {
      type: String,
      default: ''
    },

    // Personal Information (copied from GoldchildStudent)
    personalInformation: {
      firstName: String,
      lastName: String,
      email: String,
      phoneNumber: String,
      dateOfBirth: Date,
      gender: String,
      citizenship: String,
      idOrPassportNumber: String
    },

    // Academic Information (copied from GoldchildStudent)
    academicInformation: {
      highestQualification: String,
      kcseGradeOrEquivalent: String,
      course: String,
      modeOfTraining: String
    },

    // Financial Information (copied from GoldchildStudent)
    financialInformation: {
      feePayerName: String,
      feePayerPhoneNumber: String
    },

    // Next of Kin (copied from GoldchildStudent)
    nextOfKin: {
      fullName: String,
      relationship: String,
      phoneNumber: String
    },

    // Discovery Channels (copied from GoldchildStudent)
    discoveryChannels: [String],

    // Admission & Course Details (copied from GoldchildStudent)
    startDate: Date,
    courseId: mongoose.Schema.Types.ObjectId,
    courseName: String,
    duration: Number,
    durationType: String,
    courseFee: Number,

    // Payment Information (copied from GoldchildStudent)
    upfrontFee: Number,

    // Admin Notes (copied from GoldchildStudent)
    adminNotes: String,

    // Original application reference
    applicationRef: String
  },
  {
    timestamps: true,
    versionKey: false
  }
);

const getGoldchildAlumniModel = (connection) => {
  return (
    connection.models.GoldchildAlumni ||
    connection.model('GoldchildAlumni', goldchildAlumniSchema)
  );
};

module.exports = {
  getGoldchildAlumniModel
};
