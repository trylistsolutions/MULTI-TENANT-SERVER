const mongoose = require("mongoose");
const { getArobiscaSmsDB } = require('../config/db');

const arobiscaSmsConnection = getArobiscaSmsDB();
const arobiscaSmsModel = (name, schema, collection) => {
  if (!schema) {
    return arobiscaSmsConnection.model(name);
  }
  return arobiscaSmsConnection.models[name] || arobiscaSmsConnection.model(name, schema, collection);
};

const lessonSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  venue: { type: String, required: true },
  topic: { type: String, required: true },
  tutorId: { type: mongoose.Schema.Types.ObjectId, ref: "Tutor", required: true },
  attended: { type: Boolean, default: false },
  isMarked: { type: Boolean, default: false },
  attendedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
  absentStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
});

const examSchema = new mongoose.Schema({
  examDate: { type: Date, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  venue: { type: String, required: true },
  examName: { type: String, required: true },
  attended: { type: Boolean, default: false },
  isMarked: { type: Boolean, default: false },
  invigilatorId: { type: mongoose.Schema.Types.ObjectId, ref: "Tutor", required: true },
  attendedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
  absentStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
});

const eventSchema = new mongoose.Schema({
  eventDate: { type: Date, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  venue: { type: String, required: true },
  eventDescription: { type: String, required: true },
  organizerId: { type: mongoose.Schema.Types.ObjectId, ref: "Tutor", required: true },
});

const timetableSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  tutorName: { type: String },
  lessons: [lessonSchema],
  exams: [examSchema],
  events: [eventSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Tutor", required: true },
}, { timestamps: true });

// Add index for better performance
timetableSchema.index({ groupId: 1, createdBy: 1 });
timetableSchema.index({ "exams._id": 1 });

const Timetable = arobiscaSmsModel("Timetable", timetableSchema);
module.exports = Timetable;