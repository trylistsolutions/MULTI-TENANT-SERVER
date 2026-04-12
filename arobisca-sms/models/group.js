const mongoose = require("mongoose");
const { getArobiscaSmsDB } = require('../config/db');

const arobiscaSmsConnection = getArobiscaSmsDB();
const arobiscaSmsModel = (name, schema, collection) => {
  if (!schema) {
    return arobiscaSmsConnection.model(name);
  }
  return arobiscaSmsConnection.models[name] || arobiscaSmsConnection.model(name, schema, collection);
};

const groupSchema = new mongoose.Schema({
    tutorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tutor",
        required: true
    },
    tutorName: {
        type: String,
        required: false
    },
    groupName: {
        type: String,
        required: true
    },
    timeSlot: {
        type: String,
        required: true
    },
    startTime: {
        type: String,
        required: true
    },
    endTime: {
        type: String,
        required: true
    },
    maxCapacity: {
        type: Number,
        required: true,
        default: 15
    },
    currentCapacity: {
        type: Number,
        default: 0
    },
    courses: [{
        type: String
    }],
    status: {
        type: String,
        enum: ["active", "inactive"],
        default: "active"
    },
    students: [{
        _id: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
        firstName: String,
        lastName: String,
        courseName: String,
        admissionNumber: String,
        email: String
    }],
    exams: [{
        exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam' },
        examName: { type: String },
        examSchemeName: { type: String },
        examSchemeWeight: { type: Number },
        startDate: { type: Date },
        endDate: { type: Date },
        assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor' },
        status: { type: String, enum: ['upcoming','active','closed'], default: 'upcoming' }
    }],
}, { timestamps: true });

module.exports = arobiscaSmsModel('Group', groupSchema);