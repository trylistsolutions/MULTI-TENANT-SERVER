const mongoose = require('mongoose');
const { getArobiscaSmsDB } = require('../config/db');

const arobiscaSmsConnection = getArobiscaSmsDB();
const arobiscaSmsModel = (name, schema, collection) => {
  if (!schema) {
    return arobiscaSmsConnection.model(name);
  }

  return arobiscaSmsConnection.models[name] || arobiscaSmsConnection.model(name, schema, collection);
};

const CourseSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Course name is required'],
        unique: true,
        trim: true
    },
    description: {
        type: String,
        required: [true, 'Course description is required']
    },
    duration: {
        type: String,
        required: [true, 'Course duration is required']
    },
    fee: {
        type: Number,
        required: [true, 'Course fee is required'],
        min: [0, 'Course fee cannot be negative']
    },
    cardColor: {
        type: String,
        required: [true, 'Card color is required']
    },
    enrolledStudents: { type: Number, default: 0 },

    examScheme: [
        {
            name: { type: String, required: true },  
            weight: { type: Number, required: true }
        }
    ]
}, { timestamps: true });

const Course = arobiscaSmsModel('Course', CourseSchema);
module.exports = Course;
