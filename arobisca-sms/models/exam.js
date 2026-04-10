const mongoose = require('mongoose');
const { getArobiscaSmsDB } = require('../config/db');

const arobiscaSmsConnection = getArobiscaSmsDB();
const arobiscaSmsModel = (name, schema, collection) => {
  if (!schema) {
    return arobiscaSmsConnection.model(name);
  }

  return arobiscaSmsConnection.models[name] || arobiscaSmsConnection.model(name, schema, collection);
};

// Question Schema for different types
const questionSchema = new mongoose.Schema({
  questionId: {
    type: String,
    required: true // Unique identifier within exam
  },
  type: {
    type: String,
    enum: ['multipleChoice', 'essay', 'matching', 'experimental'],
    required: true
  },
  question: {
    type: String,
    required: true
  },
  marks: {
    type: Number,
    required: true,
    min: 1
  },
  
  // Multiple Choice specific
  choices: [{
    _id: false,
    text: String,
    isCorrect: Boolean
  }],
  
  // Essay specific
  maxCharacters: {
    type: Number,
    default: null // null means unlimited
  },
  
  // Matching specific - New Schema
  leftLabel: {
    type: String,
    default: 'Left Column'
  },
  rightLabel: {
    type: String,
    default: 'Right Column'
  },
  rows: {
    type: Number,
    default: 1 // Number of row pairs for student to fill
  },
  allowStudentAddRows: {
    type: Boolean,
    default: false // If true, student can add extra rows beyond tutor-set count
  },
  
  // Legacy Matching specific (keeping for backward compatibility)
  matchingLeft: [{
    _id: false,
    id: String,
    text: String
  }],
  matchingRight: [{
    _id: false,
    id: String,
    text: String
  }],
  matchingPairs: [{
    _id: false,
    left: String,
    right: String
  }],
  
  // Experimental/Short Answer specific
  sections: [{
    _id: false,
    name: String,
    marks: Number
  }],
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Main Exam Schema
const examSchema = new mongoose.Schema({
  examName: {
    type: String,
    required: true,
    trim: true
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Course'
  },
  courseName: {
    type: String,
    required: true
  },
  tutorId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Tutor'
  },
  tutorName: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  answerMode: {
    type: String,
    enum: ['student', 'tutor'],
    default: 'student'
  },
  questions: [questionSchema],
  totalMarks: {
    type: Number,
    default: 0
  },
  
  // Exam settings
  isPublished: {
    type: Boolean,
    default: false
  },
  allowAutoMarking: {
    type: Boolean,
    default: false // true only if all questions are multipleChoice
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
  timestamps: true
});

// Virtual to calculate if exam can be auto-marked
examSchema.virtual('canAutoMark').get(function() {
  if (!this.questions || this.questions.length === 0) return false;
  return this.questions.every(q => q.type === 'multipleChoice');
});

// Pre-save middleware to update canAutoMark
examSchema.pre('save', function(next) {
  this.allowAutoMarking = this.canAutoMark;
  this.totalMarks = this.questions.reduce((sum, q) => sum + q.marks, 0);
  next();
});

module.exports = arobiscaSmsModel('Exam', examSchema);
