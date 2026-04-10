const mongoose = require('mongoose');
const { getArobiscaSmsDB } = require('../config/db');

const arobiscaSmsConnection = getArobiscaSmsDB();
const arobiscaSmsModel = (name, schema, collection) => {
  if (!schema) {
    return arobiscaSmsConnection.model(name);
  }

  return arobiscaSmsConnection.models[name] || arobiscaSmsConnection.model(name, schema, collection);
};

const AlumniSchema = new mongoose.Schema({
  academicYear: { type: String, required: true},
  courseName: { type: String, required: true },
  admissionNumber: { type: String, required: true, unique: true },
  admissionDate: { type: Date, required: true },
  upfrontFee: { type: Number, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  gender: { type: String, required: true },
  dateOfBirth: { type: Date, required: true },
  religion: String,
  nationality: String,
  email: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  nationalId: String,
  courseFee: Number,
  exams: [{
    name: String,
    weight: Number,
    score: Number
  }],
  graduationDate: { type: Date, default: Date.now },
  isCertificateReady: Boolean,
  tutorName: String,
}, { timestamps: true });

module.exports = arobiscaSmsModel('Alumni', AlumniSchema);
