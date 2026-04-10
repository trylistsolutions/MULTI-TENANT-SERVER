const mongoose = require('mongoose')

// Update curriculumItemSchema in your model
const curriculumItemAttachmentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['youtube', 'vimeo', 'mp4', 'pdf', 'article', 'document', 'image', 'link', 'none'],
    default: 'none'
  },
  url: { type: String, default: '' },
  title: { type: String, default: '' }
}, { _id: true })

const curriculumItemSchema = new mongoose.Schema({
  position: { type: Number, default: 0 },
  type: { 
    type: String, 
    enum: ['lesson', 'event', 'cat', 'exam'], 
    required: true 
  },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  attachments: [curriculumItemAttachmentSchema], // Changed from single attachment
  createdAt: { type: Date, default: Date.now }
})

const curriculumSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  courseName: { type: String, default: '' },
  items: [curriculumItemSchema]
}, {
  timestamps: true
})

module.exports = mongoose.model('Curriculum', curriculumSchema)
