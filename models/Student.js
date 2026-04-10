// Student Model - Stores admitted student data
const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  // Basic Info
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, required: true, trim: true, },
  password: { type: String, required: true }, // hashed password
  dateOfBirth: { type: Date },
  gender: { type: String },
  userType: { type: String, default: 'student' },

  // Admission Info
  admissionNumber: { type: String, unique: true, sparse: true }, // set by admin during admit
  applicationRef: { type: String }, // reference to applicationNumber

  // Education Info
  qualification: { type: String, trim: true },
  course: { type: String, trim: true },
  trainingMode: { type: String, trim: true },
  preferredIntake: { type: String, trim: true },
  preferredStartDate: { type: String, trim: true },
  startDate: { type: Date },

  // Course Reference (from Goldchild DB)
  courseId: { type: String }, // Reference to GoldchildCourse._id
  courseName: { type: String, trim: true }, // Course name from DB
  durationType: { type: String, enum: ['hours', 'days', 'weeks', 'months'] }, // Duration unit
  adminNotes: { type: String, trim: true }, // Admin notes during admission

  // Personal Details
  citizenship: { type: String, trim: true },
  idNumber: { type: String, trim: true },
  kcseGrade: { type: String, trim: true },

  // Application History
  howHeardAbout: { type: [String], default: [] },
  otherSource: { type: String, trim: true },

  // Finance
  courseFee: { type: Number },
  feePayer: { type: String, trim: true },
  feePayerPhone: { type: String, trim: true },
  upfrontFee: { type: Number },

  paymentHistory: [{
    amount: { type: Number, required: true },
    paymentMethod: {
      type: String,
      enum: ['cash', 'cheque', 'bank_transfer', 'paypal', 'mpesa', 'other'],
      required: true
    },
    recordedBy: { type: String, required: true },
    notes: String,
    transactionType: {
      type: String,
      enum: ['manual', 'mpesa'],
      default: 'manual'
    },
    status: {
      type: String,
      enum: ['pending', 'complete', 'failed'],
      default: 'complete'
    },
    operation: {
      type: String,
      enum: ['add', 'deduct'],
      default: 'add'
    },
    // M-PESA specific fields
    transactionId: String,
    phone: String,
    checkoutRequestId: String,
    // Timestamps
    createdAt: { type: Date, default: Date.now }
  }],

  // Emergency Contact
  nextOfKinName: { type: String, trim: true },
  nextOfKinRelationship: { type: String, trim: true },
  nextOfKinPhone: { type: String, trim: true },

  // Course Specific Info
  courseDuration: { type: String, trim: true }, // e.g., "3 months", "6 months"
  exams: [
    {
      name: { type: String, trim: true }, // e.g., "Practical Exam", "Written Exam"
      score: { type: String, default: null }, // exam grade/score to be updated later
    }
  ],

  // Media & Status
  profilePicture: { type: String }, // URL
  profilePicPublicId: { type: String }, // Cloudinary public ID for deletion
  status: { type: String, default: 'active' },

  // Public Profile Fields
  verified: { type: Boolean, default: false }, // Mark as certified professional
  practiceStatus: { type: String, enum: ['active', 'inactive', 'on_leave', 'retired'], default: 'active' }, // Practicing status
  practicingSince: { type: Date }, // When they started practicing
  currentLocation: { type: String, trim: true }, // Current practice location
  isPublicProfileEnabled: { type: Boolean, default: true }, // Allow viewing public profile
  bio: { type: String, trim: true }, // Professional bio/description

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});


// Add indexes for faster search queries
studentSchema.index({ firstName: 1, isPublicProfileEnabled: 1 });
studentSchema.index({ lastName: 1, isPublicProfileEnabled: 1 });
studentSchema.index({ email: 1, isPublicProfileEnabled: 1 });
studentSchema.index({ admissionNumber: 1, isPublicProfileEnabled: 1 });
studentSchema.index({ phone: 1, isPublicProfileEnabled: 1 });

// Additional useful indexes
studentSchema.index({ status: 1, isPublicProfileEnabled: 1 });
studentSchema.index({ verified: 1, isPublicProfileEnabled: 1 });
studentSchema.index({ createdAt: -1 }); // For sorting by recent



const Student = mongoose.model('Student', studentSchema);
module.exports = Student;
