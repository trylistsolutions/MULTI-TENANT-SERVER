// Alumni Model - Stores graduated student data
const mongoose = require('mongoose');

const alumniSchema = new mongoose.Schema({
  // Basic Info
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, required: true, trim: true },
  password: { type: String, required: true }, // hashed password
  dateOfBirth: { type: Date },
  gender: { type: String },
  userType: { type: String, default: 'alumni' },

  // Admission Info
  admissionNumber: { type: String, unique: true, sparse: true },
  applicationRef: { type: String },

  // Education Info
  qualification: { type: String, trim: true },
  kcseGrade: { type: String, trim: true },

  // course details 
  course: { type: String, trim: true },
  trainingMode: { type: String, trim: true },
  preferredIntake: { type: String, trim: true },
  preferredStartDate: { type: String, trim: true },
  startDate: { type: Date },
  courseDuration: { type: String, trim: true },

  // Personal Details
  citizenship: { type: String, trim: true },
  idNumber: { type: String, trim: true },

  // Application History
  howHeardAbout: { type: [String], default: [] },
  otherSource: { type: String, trim: true },
  
  // Finance
  courseFee: { type: Number },
  upfrontFee: { type: Number },
  feePayer: { type: String, trim: true },
  feePayerPhone: { type: String, trim: true },

  // Emergency Contact
  nextOfKinName: { type: String, trim: true },
  nextOfKinRelationship: { type: String, trim: true },
  nextOfKinPhone: { type: String, trim: true },

  // Course Specific Info
  exams: [
    {
      name: { type: String, trim: true },
      score: { type: String, default: null }, // Final exam grade
    }
  ],

  // Media & Status
  profilePicture: {
    url: {
      type: String,
      default: null
    },
    cloudinaryId: {
      type: String,
      default: null
    }
  }, // Cloudinary public ID for deletion
  status: { type: String, default: 'alumni' },

  // Graduation Info
  graduationDate: { type: Date, default: Date.now },

  // Public Profile Fields
  verified: { type: Boolean, default: true }, // Mark as certified professional
  adminVerified: { type: Boolean, default: true },
  practiceStatus: { type: String, enum: ['active', 'inactive', 'on_leave', 'retired'], default: 'active' }, // Practicing status
  practicingSince: { type: Date }, // When they started practicing
  currentLocation: { type: String, trim: true }, // Current practice location
  isPublicProfileEnabled: { type: Boolean, default: true }, // Allow viewing public profile
  bio: { type: String, trim: true }, // Professional bio/description

  // Password Reset Fields
  resetCode: { type: String, default: null }, // 4-digit reset code
  resetCodeExpiry: { type: Date, default: null }, // When reset code expires
  resetAttempts: { type: Number, default: 0 }, // Track failed reset attempts

  subscription: {
    // Current active subscription
    active: {
      type: Boolean,
      default: false
    },
    expiryDate: {
      type: Date,
      default: null
    },
    yearsSubscribed: {
      type: Number,
      default: 0
    },
    lastPaymentDate: {
      type: Date,
      default: null
    },
    autoRenew: {
      type: Boolean,
      default: false
    }
  },

  // Subscription payment history
  subscriptionPayments: [
    {
      years: {
        type: Number,
        required: true,
        min: 1
      },
      amount: {
        type: Number,
        required: true
      },
      paymentDate: {
        type: Date,
        default: Date.now
      },
      expiryDate: {
        type: Date,
        required: true
      },
      paymentMethod: {
        type: String,
        enum: ['mpesa', 'cash', 'bank_transfer', 'cheque', 'paypal'],
        default: 'mpesa'
      },
      transactionId: String,
      phone: String,
      status: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'cancelled'],
        default: 'pending'
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }
  ],

  // Add courses array (same structure as User model)
  courses: [
    {
      courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
      name: { type: String },
      duration: { type: Number },
      durationType: { type: String },
      payment: {
        status: { type: String, enum: ['PENDING', 'PAID', 'FAILED'], default: 'PENDING' },
        phone: { type: String },
        transactionId: { type: String },
        amount: { type: Number },
        timeOfPayment: { type: Date }
      },
      assignmentStatus: { type: String, enum: ['PENDING', 'ASSIGNED', 'CANCELLED'], default: 'PENDING' },
      enrolledAt: { type: Date, default: Date.now },
      adminNotes: { type: String, default: '' },
      curriculum: {
        curriculumId: { type: mongoose.Schema.Types.ObjectId, ref: 'Curriculum', default: null },
        assignedAt: { type: Date, default: null },
        itemStatus: [
          {
            itemId: { type: mongoose.Schema.Types.ObjectId },
            status: { type: String, enum: ['PENDING', 'COMPLETED'], default: 'PENDING' },
            completedAt: { type: Date, default: null }
          }
        ]
      },
      tutor: {
        id: { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor', default: null },
        name: { type: String, default: null },
        email: { type: String, default: null },
        phone: { type: String, default: null },
        status: { type: String, enum: ['PENDING', 'ASSIGNED', 'CANCELLED'], default: 'PENDING' }
      },
      paymentNotificationHidden: { type: Boolean, default: false },
      // Certification fields
      exams: [
        {
          examName: { type: String, required: true },
          grade: {
            type: String,
            enum: ['Distinction', 'Merit', 'Credit', 'Pass', 'Fail'],
            required: true
          },
          recordedAt: { type: Date, default: Date.now }
        }
      ],
      gpa: { type: Number, default: 0 },
      finalGrade: { type: String, default: '' },
      certificationDate: { type: Date, default: null },
      certificationStatus: { type: String, enum: ['PENDING', 'CERTIFIED', 'GRADUATED'], default: 'PENDING' }
    }
  ],

  // CPD (Continuing Professional Development) Records
  cpdRecords: [
    {
      year: { type: Number, required: true }, // Year of CPD exam (e.g., 2025)
      dateTaken: { type: Date, required: true }, // Date exam was taken
      result: { type: String, enum: ['pass', 'fail'], required: true }, // Pass or Fail
      score: { type: Number }, // Score obtained (optional)
      remarks: { type: String, trim: true }, // Additional remarks/notes
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    }
  ],

  // Discussions - For student-tutor communication on curriculum items
  discussions: [
    {
      _id: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
      curriculumId: { type: mongoose.Schema.Types.ObjectId, ref: 'Curriculum' },
      itemId: { type: mongoose.Schema.Types.ObjectId }, // Reference to curriculum item
      title: { type: String, required: true }, // Custom title or module name
      messages: [
        {
          _id: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
          senderType: { type: String, enum: ['student', 'tutor'], required: true },
          senderId: { type: mongoose.Schema.Types.ObjectId },
          senderName: { type: String, required: true },
          message: { type: String, required: true },
          createdAt: { type: Date, default: Date.now }
        }
      ],
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    }
  ],

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});


// Add indexes for faster search queries
alumniSchema.index({ firstName: 1, isPublicProfileEnabled: 1 });
alumniSchema.index({ lastName: 1, isPublicProfileEnabled: 1 });
alumniSchema.index({ email: 1, isPublicProfileEnabled: 1 });
alumniSchema.index({ admissionNumber: 1, isPublicProfileEnabled: 1 });
alumniSchema.index({ phone: 1, isPublicProfileEnabled: 1 });

// Additional useful indexes
alumniSchema.index({ status: 1, isPublicProfileEnabled: 1 });
alumniSchema.index({ verified: 1, isPublicProfileEnabled: 1 });
alumniSchema.index({ createdAt: -1 }); // For sorting by recent

const Alumni = mongoose.model('Alumni', alumniSchema);
module.exports = Alumni;
