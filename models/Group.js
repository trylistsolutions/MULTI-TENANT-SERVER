const mongoose = require('mongoose')

// Update the studentResponseSchema to support multiple attachments
const studentResponseAttachmentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['youtube', 'vimeo', 'mp4', 'pdf', 'article', 'document', 'image', 'link', 'none'],
    default: 'none'
  },
  url: { type: String, default: '' },
  title: { type: String, default: '' }
}, { _id: true })

const studentResponseSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  studentName: { type: String },
  responseText: { type: String, default: '' },
  attachments: [studentResponseAttachmentSchema], // Changed from single attachment
  isQuestion: { type: Boolean, default: false },
  isPublic: { type: Boolean, default: false },
  tutorRemark: { type: String, default: '' },
  tutorRemarkAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
})

// Update the groupCurriculumItemSchema to support multiple attachments
const groupCurriculumItemAttachmentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['youtube', 'vimeo', 'mp4', 'pdf', 'article', 'document', 'image', 'link', 'none'],
    default: 'none'
  },
  url: { type: String, default: '' },
  title: { type: String, default: '' }
}, { _id: true })

const groupCurriculumItemSchema = new mongoose.Schema({
  position: { type: Number, default: 0 },
  type: {
    type: String,
    enum: ['lesson', 'event', 'cat', 'exam'],
    required: true
  },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  attachments: [groupCurriculumItemAttachmentSchema], // Changed from single attachment
  releaseDate: { type: Date, default: null },
  releaseTime: { type: String, default: '00:00' },
  dueDate: { type: Date, default: null },
  dueTime: { type: String, default: '23:59' },
  isReleased: { type: Boolean, default: false },
  sourceItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
  isCompleted: { type: Boolean, default: false },
  responses: [studentResponseSchema],
  createdAt: { type: Date, default: Date.now }
})

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  tutorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  courseName: { type: String, default: '' },
  students: [
    {
      studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String },
      addedAt: { type: Date, default: Date.now }
    }
  ],
  curriculumItems: [groupCurriculumItemSchema]
}, {
  timestamps: true
})

module.exports = mongoose.model('Group', groupSchema)
