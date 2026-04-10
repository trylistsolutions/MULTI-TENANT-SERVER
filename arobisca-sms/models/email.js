const mongoose = require('mongoose');
const { getArobiscaSmsDB } = require('../config/db');

const arobiscaSmsConnection = getArobiscaSmsDB();
const arobiscaSmsModel = (name, schema, collection) => {
  if (!schema) {
    return arobiscaSmsConnection.model(name);
  }

  return arobiscaSmsConnection.models[name] || arobiscaSmsConnection.model(name, schema, collection);
};

const EmailSchema = new mongoose.Schema({
  recipientEmail: { type: String, required: true },
  recipientName: { type: String, required: false },
  subject: { type: String, required: true },
  body: { type: String, required: true },
  
  // Template or Custom
  emailType: { type: String, enum: ['template', 'custom'], required: true },
  
  // For template emails - store the template data
  templateData: {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: false },
    alumniId: { type: mongoose.Schema.Types.ObjectId, ref: 'Alumni', required: false },
    studentName: { type: String, required: false },
    admissionNumber: { type: String, required: false },
    courseName: { type: String, required: false },
    startDate: { type: Date, required: false },
    endDate: { type: Date, required: false },
    courseDuration: { type: String, required: false },
    signedBy: { type: String, required: false },
    refNumber: { type: String, required: false },
  },
  
  // Sending details
  status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
  sentAt: { type: Date, required: false },
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: false },
  
  // Error tracking
  errorMessage: { type: String, required: false },
  retryCount: { type: Number, default: 0 },
  
  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Index for faster queries on month/year
EmailSchema.index({ createdAt: 1, status: 1 });
EmailSchema.index({ recipientEmail: 1 });

module.exports = arobiscaSmsModel('Email', EmailSchema);
