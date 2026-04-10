const mongoose = require('mongoose');
const { getArobiscaSmsDB } = require('../config/db');

const arobiscaSmsConnection = getArobiscaSmsDB();
const arobiscaSmsModel = (name, schema, collection) => {
  if (!schema) {
    return arobiscaSmsConnection.model(name);
  }

  return arobiscaSmsConnection.models[name] || arobiscaSmsConnection.model(name, schema, collection);
};

const attendanceSchema = new mongoose.Schema({
  date: { type: Date, },
  topic: { type: String, },
  event: { type: String, },
  tutorId: { type: mongoose.Schema.Types.ObjectId, },
});

const examSchema = new mongoose.Schema({
  name: { type: String, required: true },
  weight: { type: Number, required: true },
  score: { type: Number, default: 0 }
});

const borrowedBooks = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Inventory", required: true },
  bookName: { type: String, },
  bookImage: { type: String, },
  dateBorrowed: { type: Date, },
  returnDate: { type: Date, },
  allowedDays: { type: Number },
  accruedFee: { type: Number, default: 0 },
});

const feeUpdateSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  previousAmount: { type: Number, required: true },
  changeType: { type: String, enum: ["initial", "increase", "decrease"], required: true },
  timestamp: { type: Date, default: Date.now },
  processedBy: { type: String },
  note: { type: String }
});


const studentSchema = new mongoose.Schema({
  academicYear: { type: String, required: false },
  course: { type: String, required: true },
  courseName: { type: String, required: true },
  admissionNumber: { type: String, required: true, unique: true },
  admissionDate: { type: Date, required: false },
  upfrontFee: { type: Number, default: 0 },
  feeUpdates: [feeUpdateSchema],
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  allotment: { type: String, required: false },
  isCertificateReady: { type: Boolean, },
  tutorId: { type: String, required: false },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Group",
    required: false
  },
  tutorName: { type: String, required: false },
  gender: { type: String, required: true },
  dateOfBirth: { type: Date, required: true },
  startDate: { type: Date, required: true },
  assignedCohort: { type: Date, required: false },
  religion: { type: String, required: false },
  nationality: { type: String, required: false },
  email: { type: String, required: true, unique: true },
  phoneNumber: { type: String, required: true },
  nationalId: { type: String, required: true, unique: true },
  emergencyContact: {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    relation: { type: String, required: true },
    phone: { type: String, required: true }
  },
  courseDuration: { type: String, required: false },
  courseFee: { type: Number, required: false },
  profileImage: { type: String, required: false },
  profilePicPublicId: { type: String, required: false },
  password: { type: String },
  attendance: {
    attended: [attendanceSchema],
    absent: [attendanceSchema],
  },
  exams: [examSchema],
  assignedExams: [{
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam' },
    examName: { type: String },
    examSchemeName: { type: String },
    examSchemeWeight: { type: Number },
    startDate: { type: Date },
    endDate: { type: Date },
    status: { type: String, enum: ['upcoming','active','closed'], default: 'upcoming' },
    submitted: { type: Boolean, default: false },
    submittedAt: { type: Date }
  }],
  examResponses: [{
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam' },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
    answers: [{
      questionId: { type: String },
      response: { type: mongoose.Schema.Types.Mixed },
      marksAwarded: { type: Number, default: 0 }
    }],
    totalScore: { type: Number, default: 0 },
    appliedScore: { type: Number, default: 0 },
    isAutoMarked: { type: Boolean, default: false },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor' },
    markedAt: { type: Date },
    finalized: { type: Boolean, default: false }
  }],
  borrowedBooks: [borrowedBooks],
}, { timestamps: true });

const Student = arobiscaSmsConnection.models.Student || arobiscaSmsModel('Student', studentSchema);

module.exports = Student;
