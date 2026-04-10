const mongoose = require('mongoose');
const { getArobiscaSmsDB } = require('../config/db');

const arobiscaSmsConnection = getArobiscaSmsDB();
const arobiscaSmsModel = (name, schema, collection) => {
  if (!schema) {
    return arobiscaSmsConnection.model(name);
  }

  return arobiscaSmsConnection.models[name] || arobiscaSmsConnection.model(name, schema, collection);
};

const quizSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    question: {
        type: String,
        required: true
    },
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Group'
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
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    additionalNotes: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['active', 'expired', 'draft'],
        default: 'active'
    },
    weight: {
        type: Number,
        required: true,
        min: 1
    },
    responses: [{
        studentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Student',
            required: true
        },
        studentName: {
            type: String,
            required: true
        },
        admissionNumber: {
            type: String,
            required: true
        },
        course: {
            type: String,
            required: true
        },
        answer: {
            type: String,
            required: true
        },
        submittedAt: {
            type: Date,
            default: Date.now
        },
        grade: {
            type: Number,
            default: null
        },
        feedback: {
            type: String,
            default: ''
        }
    }]
}, {
    timestamps: true
});

// Virtual to check if quiz is expired
quizSchema.virtual('isExpired').get(function () {
    return new Date() > this.endDate;
});

// Virtual to get response count
quizSchema.virtual('responseCount').get(function () {
    return this.responses.length;
});

// Update status based on end date
quizSchema.pre('save', function (next) {
    if (new Date() > this.endDate) {
        this.status = 'expired';
    }
    next();
});

module.exports = arobiscaSmsModel('Quiz', quizSchema);