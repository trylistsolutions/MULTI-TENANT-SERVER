const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
  examName: { type: String, required: true },
  grade: {
    type: String,
    enum: ['Distinction', 'Merit', 'Credit', 'Pass', 'Fail'],
    required: true
  },
  recordedAt: { type: Date, default: Date.now }
})

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, unique: true, lowercase: true },
  phone: { type: String, required: true, trim: true },
  idNumber: { type: String, required: true, trim: true },
  dob: { type: Date, required: true },
  userType: { type: String, default: 'student' },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },

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
      exams: [examSchema],
      gpa: { type: Number, default: 0 },
      finalGrade: { type: String, default: '' },
      certificationDate: { type: Date, default: null },
      certificationStatus: { type: String, enum: ['PENDING', 'CERTIFIED', 'GRADUATED'], default: 'PENDING' }
    }
  ],
  currentLocation: { type: String, trim: true }, // Current practice location
  admissionNumber: { type: String, unique: true },
  isPublicProfileEnabled: { type: Boolean, default: true }, // Allow viewing public profile
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
  // Emergency Contact
  nextOfKinName: { type: String, trim: true },
  nextOfKinRelationship: { type: String, trim: true },
  nextOfKinPhone: { type: String, trim: true },

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
  ]
});

module.exports = mongoose.model('User', userSchema);
