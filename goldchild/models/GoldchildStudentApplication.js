const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.Mixed, default: null },
    name: { type: String, default: null, trim: true },
    title: { type: String, default: null, trim: true }
  },
  { _id: false }
);

const goldchildStudentApplicationSchema = new mongoose.Schema(
  {
    applicationNumber: {
      type: String,
      unique: true,
      index: true,
      default: () => {
        const currentYear = new Date().getFullYear();
        const randomNum = Math.floor(Math.random() * 1000000)
          .toString()
          .padStart(6, '0');
        return `GCA-${currentYear}-${randomNum}`;
      }
    },
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
    academicInformation: {
      highestQualification: { type: String, required: true, trim: true },
      kcseGradeOrEquivalent: { type: String, required: true, trim: true },
      course: { type: courseSchema, required: true },
      preferredIntakeMonth: { type: String, required: true, trim: true },
      preferredStartDate: { type: String, default: null },
      modeOfTraining: { type: String, required: true, trim: true }
    },
    discoveryChannels: {
      type: [String],
      default: [],
      validate: {
        validator: (value) => Array.isArray(value) && value.length > 0,
        message: 'At least one discovery channel is required.'
      }
    },
    financialInformation: {
      feePayerName: { type: String, required: true, trim: true },
      feePayerPhoneNumber: { type: String, required: true, trim: true }
    },
    nextOfKin: {
      fullName: { type: String, required: true, trim: true },
      relationship: { type: String, required: true, trim: true },
      phoneNumber: { type: String, required: true, trim: true }
    },
    declarations: {
      rulesAccepted: { type: Boolean, required: true }
    },
    status: {
      type: String,
      enum: ['pending', 'admitted', 'rejected'],
      default: 'pending',
      index: true
    },
    rejectionReason: {
      type: String,
      default: null,
      trim: true
    },
    rejectedAt: {
      type: Date,
      default: null
    },
    submittedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

const getGoldchildStudentApplicationModel = (connection) => {
  return (
    connection.models.GoldchildStudentApplication ||
    connection.model('GoldchildStudentApplication', goldchildStudentApplicationSchema)
  );
};

module.exports = {
  getGoldchildStudentApplicationModel
};
