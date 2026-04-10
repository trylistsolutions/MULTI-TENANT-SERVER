const mongoose = require('mongoose');

const tutorSchema = new mongoose.Schema({
  // Personal Information
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  role: {
    type: String,
    required: [true, 'Role is required'],
    trim: true,
    default: 'Tutor'
  },

   userType: { type: String, default: 'tutor' },

  // Contact Information
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    match: [/^\+?[\d\s\-\(\)]+$/, 'Please enter a valid phone number']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },

  // Professional Information
  kraPin: {
    type: String,
    trim: true,
    uppercase: true,
  },

  // Profile Picture
  profilePicture: {
    url: {
      type: String,
      default: null
    },
    cloudinaryId: {
      type: String,
      default: null
    }
  },

  // Authentication
  password: {
    type: String,
    default: null
  },

  // Course Assignments
  courses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  }],

  // Students assigned to this tutor
  myStudents: [
    {
      studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String },
      courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
      courseName: { type: String },
      paymentStatus: { type: String, enum: ['PENDING', 'PAID', 'FAILED'], default: 'PENDING' },
      isAssignedToGroup: { type: Boolean, default: false },
      assignedGroup: {
        groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
        groupName: { type: String, default: null }
      },
      settlement: {
        status: { type: String, enum: ['PENDING', 'PAID', 'FAILED'], default: 'PENDING' },
        amount: { type: Number },
        phone: { type: String },
        transactionId: { type: String },
        timeOfPayment: { type: Date }
      },
      assignedAt: { type: Date, default: Date.now }
    }
  ],

  // Certified/Graduated Students Records
  certifiedStudents: [
    {
      studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      studentName: { type: String },
      email: { type: String },
      phone: { type: String },
      courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
      courseName: { type: String },
      payment: {
        status: { type: String, enum: ['PENDING', 'PAID', 'FAILED'] },
        amount: { type: Number },
        phone: { type: String },
        transactionId: { type: String },
        timeOfPayment: { type: Date }
      },
      settlement: {
        status: { type: String, enum: ['PENDING', 'PAID', 'FAILED'], default: 'PENDING' },
        amount: { type: Number },
        phone: { type: String },
        transactionId: { type: String },
        timeOfPayment: { type: Date }
      },
      exams: [
        {
          examName: { type: String },
          grade: { type: String, enum: ['Distinction', 'Merit', 'Credit', 'Pass', 'Fail'] },
          recordedAt: { type: Date, default: Date.now }
        }
      ],
      gpa: { type: Number },
      finalGrade: { type: String },
      certificationDate: { type: Date, default: Date.now }
    }
  ],

  // Status and Metadata
  isActive: {
    type: Boolean,
    default: true
  },
  joinDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});


module.exports = mongoose.model('Tutor', tutorSchema);