const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const Course = require('../models/Course')
const MpesaTransaction = require('../models/Mpesa')
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const Tutor = require('../models/Tutor');
const Alumni = require('../models/Alumni');


const JWT_SECRET = process.env.ZOEZI_JWT_SECRET || 'zoezi_secret'

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.ZOEZI_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.ZOEZI_CLOUDINARY_API_KEY,
  api_secret: process.env.ZOEZI_CLOUDINARY_API_SECRET,
  secure: true
});

// Multer in-memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Cloudinary upload utility
const uploadToCloudinary = (fileBuffer, folder = 'profile_pictures') => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto:good' },
          { format: 'auto' }
        ]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    ).end(fileBuffer);
  });
};

// DELETE from Cloudinary utility
const deleteFromCloudinary = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    // Don't throw error - we don't want to fail the request if Cloudinary deletion fails
  }
};

// Simple auth middleware
function verifyToken(req, res, next) {
  const auth = req.headers.authorization || req.headers.Authorization
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ status: 'error', message: 'Missing token' })
  const token = auth.split(' ')[1]
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.userId = payload.id
    req.userType = payload.type
    next()
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Invalid token' })
  }
}

// GET /users/:id - Get full user data including discussions (for refresh functionality)
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params
    const { userType } = req.query

    // Authorization: allow user to access their own data, or tutor to access their student's data
    if (req.userId !== id) {
      // Check if requester is a tutor accessing their student
      const tutor = await Tutor.findById(req.userId).lean();
      if (!tutor) return res.status(403).json({ status: 'error', message: 'Forbidden' })

      // Verify tutor has this student in their courses
      const student = await User.findById(id).select('courses').lean() || await Alumni.findById(id).select('courses').lean();
      if (!student) return res.status(404).json({ status: 'error', message: 'Student not found' })

      const hasTutorAccess = student.courses?.some(c => 
        c.tutor?.id && String(c.tutor.id) === String(req.userId)
      );
      if (!hasTutorAccess) return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }

    // Determine which model to use based on userType
    let model;
    if (userType === 'student') {
      model = User;
    } else if (userType === 'alumni') {
      model = Alumni;
    } else if (userType === 'tutor') {
      model = Tutor;
    } else {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid user type'
      });
    }

    const user = await model.findById(id)
      .select('-password -resetCode -resetCodeExpiry')
      .populate('courses.courseId', 'name duration durationType')
      .lean();

    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' })

    return res.status(200).json({
      status: 'success',
      data: user
    })
  } catch (err) {
    console.error('Get user data error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to fetch user data' })
  }
})

// GET /users/:id/courses - get user's enrolled courses (UPDATED)
router.get('/:id/courses', verifyToken, async (req, res) => {
  try {
    const { id } = req.params
    const { userType } = req.query // Get userType from query params

    
    if (req.userId !== id) return res.status(403).json({ status: 'error', message: 'Forbidden' })

    // Determine which model to use based on userType
    let model;
    if (userType === 'student') {
      model = User;
    } else if (userType === 'tutor') {
      model = Tutor;
    } else if (userType === 'alumni') {
      model = Alumni;
    } else {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid user type'
      });
    }

    const user = await model.findById(id).select('courses')
      .populate('courses.courseId', 'coverImage description duration durationType name');
    
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' })
    
    return res.status(200).json({ 
      status: 'success', 
      data: user.courses || [] 
    })
  } catch (err) {
    console.error('Get user courses error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to fetch courses' })
  }
})

// GET /users/profile - get current user's profile data with progress (UPDATED)
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const { userType } = req.query // Get userType from query params
    
    // Determine which model to use based on userType
    let model;
    if (userType === 'student') {
      model = User;
    } else if (userType === 'tutor') {
      model = Tutor;
    } else if (userType === 'alumni') {
      model = Alumni;
    } else {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid user type'
      });
    }

    const user = await model.findById(req.userId)
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' })

    // Calculate completion percentage for each course (for students AND alumni)
    let coursesWithProgress = [];
    
    if ((userType === 'student' || userType === 'alumni') && user.courses) {
      const Group = require('../models/Group')
      coursesWithProgress = await Promise.all(
        user.courses.map(async (course) => {
          if (!course.assignedGroup?.groupId) {
            return { ...course.toObject(), completionPercentage: 0 }
          }

          try {
            const group = await Group.findById(course.assignedGroup.groupId)
            if (!group || !group.curriculumItems || group.curriculumItems.length === 0) {
              return { ...course.toObject(), completionPercentage: 0 }
            }

            // Calculate completed items for this specific student in this group
            const totalItems = group.curriculumItems.length
            const completedItems = group.curriculumItems.filter(item => 
              item.isCompleted
            ).length

            const completionPercentage = totalItems > 0 
              ? Math.round((completedItems / totalItems) * 100)
              : 0

            return { 
              ...course.toObject(), 
              completionPercentage: Math.min(completionPercentage, 100)
            }
          } catch (err) {
            console.error('Error calculating progress:', err)
            return { ...course.toObject(), completionPercentage: 0 }
          }
        })
      )
    } else {
      // For tutors, just return courses as-is
      coursesWithProgress = user.courses || []
    }

    const userWithProgress = {
      ...user.toObject(),
      courses: coursesWithProgress
    }

    return res.status(200).json({
      status: 'success',
      data: userWithProgress
    })
  } catch (err) {
    console.error('Get profile error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to fetch profile' })
  }
})

// GET /users/admin/list - Get all e-learning users with detailed information (ADMIN ONLY)
router.get('/admin/list', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', status = '' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query
    let query = {};
    
    // Search filter
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { admissionNumber: searchRegex }
      ];
    }
    
    // Status filter
    if (status === 'active') {
      query['subscription.active'] = true;
    } else if (status === 'inactive') {
      query['subscription.active'] = false;
    }
    
    // Get total count
    const total = await User.countDocuments(query);
    
    // Get users with populated data
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get Group model for progress calculation
    const Group = require('../models/Group');
    
    // Enrich users with course progress data
    const usersWithProgress = await Promise.all(
      users.map(async (user) => {
        const userObj = user.toObject();
        
        // Calculate progress for each course
        if (userObj.courses && userObj.courses.length > 0) {
          userObj.courses = await Promise.all(
            userObj.courses.map(async (course) => {
              if (!course.assignedGroup?.groupId) {
                return {
                  ...course,
                  progress: {
                    percentage: 0,
                    completed: 0,
                    total: 0,
                    nextItem: null
                  }
                };
              }
              
              try {
                const group = await Group.findById(course.assignedGroup.groupId);
                if (!group || !group.curriculumItems || group.curriculumItems.length === 0) {
                  return {
                    ...course,
                    progress: {
                      percentage: 0,
                      completed: 0,
                      total: 0,
                      nextItem: null
                    }
                  };
                }
                
                // Calculate progress for this specific student
                const totalItems = group.curriculumItems.length;
                const completedItems = group.curriculumItems.filter(item => 
                  item.isCompleted
                ).length;
                
                const percentage = totalItems > 0 
                  ? Math.round((completedItems / totalItems) * 100)
                  : 0;
                
                // Find next item (not completed and released or no release date)
                const now = new Date();
                const nextItem = group.curriculumItems
                  .filter(item => !item.isCompleted)
                  .sort((a, b) => {
                    // Sort by position if available, otherwise by release date
                    if (a.position !== undefined && b.position !== undefined) {
                      return a.position - b.position;
                    }
                    return 0;
                  })[0];
                
                return {
                  ...course,
                  progress: {
                    percentage,
                    completed: completedItems,
                    total: totalItems,
                    nextItem: nextItem ? {
                      name: nextItem.name,
                      type: nextItem.type,
                      position: nextItem.position
                    } : null
                  }
                };
              } catch (err) {
                console.error(`Error calculating progress for course ${course._id}:`, err);
                return {
                  ...course,
                  progress: {
                    percentage: 0,
                    completed: 0,
                    total: 0,
                    nextItem: null
                  }
                };
              }
            })
          );
        }
        
        // Calculate overall statistics
        const stats = {
          totalCourses: userObj.courses?.length || 0,
          activeCourses: userObj.courses?.filter(c => c.assignmentStatus === 'ASSIGNED').length || 0,
          certifiedCourses: userObj.courses?.filter(c => c.certificationStatus === 'CERTIFIED' || c.certificationStatus === 'GRADUATED').length || 0,
          averageProgress: userObj.courses && userObj.courses.length > 0
            ? Math.round(userObj.courses.reduce((sum, course) => sum + (course.progress?.percentage || 0), 0) / userObj.courses.length)
            : 0
        };
        
        return {
          ...userObj,
          stats
        };
      })
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        users: usersWithProgress,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (err) {
    console.error('Admin get users error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch users',
      error: err.message
    });
  }
});

// GET /users/admin/:id - Get detailed information for a specific user (ADMIN ONLY)
router.get('/admin/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user with all details
    const user = await User.findById(id)
      .select('-password')
      .lean();
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    // Get Group model for progress calculation
    const Group = require('../models/Group');
    const Course = require('../models/Course');
    
    // Calculate detailed progress for each course
    if (user.courses && user.courses.length > 0) {
      user.courses = await Promise.all(
        user.courses.map(async (course) => {
          const courseWithDetails = { ...course };
          
          // Get course details if courseId exists
          if (course.courseId) {
            try {
              const courseDetails = await Course.findById(course.courseId)
                .select('name description coverImage duration durationType')
                .lean();
              courseWithDetails.details = courseDetails;
            } catch (err) {
              console.error(`Error fetching course details: ${err}`);
            }
          }
          
          // Calculate group progress if assigned to group
          if (course.assignedGroup?.groupId) {
            try {
              const group = await Group.findById(course.assignedGroup.groupId)
                .lean();
              
              if (group && group.curriculumItems) {
                const totalItems = group.curriculumItems.length;
                const completedItems = group.curriculumItems.filter(item => 
                  item.isCompleted
                ).length;
                
                const percentage = totalItems > 0 
                  ? Math.round((completedItems / totalItems) * 100)
                  : 0;
                
                // Get curriculum items with status
                const curriculumItems = group.curriculumItems.map(item => ({
                  name: item.name,
                  type: item.type,
                  position: item.position,
                  isCompleted: item.isCompleted,
                  releaseDate: item.releaseDate,
                  dueDate: item.dueDate,
                  isReleased: item.isReleased
                }));
                
                courseWithDetails.progress = {
                  percentage,
                  completed: completedItems,
                  total: totalItems,
                  curriculumItems,
                  nextItem: group.curriculumItems
                    .filter(item => !item.isCompleted)
                    .sort((a, b) => (a.position || 0) - (b.position || 0))[0] || null
                };
              }
            } catch (err) {
              console.error(`Error calculating group progress: ${err}`);
              courseWithDetails.progress = {
                percentage: 0,
                completed: 0,
                total: 0,
                curriculumItems: [],
                nextItem: null
              };
            }
          } else {
            courseWithDetails.progress = {
              percentage: 0,
              completed: 0,
              total: 0,
              curriculumItems: [],
              nextItem: null
            };
          }
          
          return courseWithDetails;
        })
      );
    }
    
    // Format dates for better readability
    if (user.dob) user.dob = new Date(user.dob).toISOString().split('T')[0];
    if (user.createdAt) user.createdAt = new Date(user.createdAt).toISOString();
    if (user.cpdRecords) {
      user.cpdRecords = user.cpdRecords.map(record => ({
        ...record,
        dateTaken: record.dateTaken ? new Date(record.dateTaken).toISOString().split('T')[0] : null
      }));
    }
    
    // Format subscription info
    if (user.subscription) {
      user.subscription.expiryDate = user.subscription.expiryDate 
        ? new Date(user.subscription.expiryDate).toISOString().split('T')[0]
        : null;
      user.subscription.lastPaymentDate = user.subscription.lastPaymentDate
        ? new Date(user.subscription.lastPaymentDate).toISOString().split('T')[0]
        : null;
    }
    
    // Format subscription payments
    if (user.subscriptionPayments) {
      user.subscriptionPayments = user.subscriptionPayments.map(payment => ({
        ...payment,
        paymentDate: payment.paymentDate ? new Date(payment.paymentDate).toISOString().split('T')[0] : null,
        expiryDate: payment.expiryDate ? new Date(payment.expiryDate).toISOString().split('T')[0] : null,
        createdAt: payment.createdAt ? new Date(payment.createdAt).toISOString().split('T')[0] : null
      }));
    }
    
    res.status(200).json({
      status: 'success',
      data: user
    });
  } catch (err) {
    console.error('Admin get user details error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch user details',
      error: err.message
    });
  }
});

// POST /users/enroll - enroll user in course (UPDATED)
router.post('/enroll', verifyToken, async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    // Accept either `paymentData` (frontend) or legacy `payment` body key
    const { userId, courseId, userType, curriculumId } = req.body
    const paymentData = req.body.paymentData || req.body.payment || {}

    // Ensure token user matches provided user or allow admins (not implemented)
    if (req.userId !== userId) {
      await session.abortTransaction(); session.endSession()
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }

    // Determine which model to use based on userType
    let model;
    let isStudentOrAlumni = false;
    if (userType === 'student') {
      model = User;
      isStudentOrAlumni = true;
    } else if (userType === 'tutor') {
      model = Tutor;
    } else if (userType === 'alumni') {
      model = Alumni;
      isStudentOrAlumni = true;
    } else {
      await session.abortTransaction(); session.endSession()
      return res.status(400).json({
        status: 'error',
        message: 'Invalid user type'
      });
    }

    const user = await model.findById(userId).session(session)
    const course = await Course.findById(courseId).session(session)
    if (!user || !course) {
      await session.abortTransaction(); session.endSession()
      return res.status(404).json({ status: 'error', message: 'User or Course not found' })
    }

    // Check already enrolled
    const already = user.courses?.some(c => String(c.courseId) === String(courseId))
    if (already) {
      await session.abortTransaction(); session.endSession()
      return res.status(409).json({ status: 'error', message: 'Already enrolled' })
    }

    // Determine payment status: if transactionId exists => PAID, otherwise FAILED
    const paymentStatus = paymentData?.transactionId ? 'PAID' : (paymentData?.status || 'FAILED')

    const enrollment = {
      courseId: course._id,
      name: course.name,
      duration: course.duration,
      durationType: course.durationType,
      payment: {
        status: paymentStatus,
        phone: paymentData?.phone || null,
        transactionId: paymentData?.transactionId || null,
        amount: paymentData?.amount || null,
        timeOfPayment: paymentData?.timeOfPayment ? new Date(paymentData.timeOfPayment) : (paymentData?.timeOfPayment ? new Date(paymentData.timeOfPayment) : null)
      },
      enrolledAt: new Date(),
      assignmentStatus: 'PENDING',
      tutor: null,
      curriculum: curriculumId ? { curriculumId, assignedAt: new Date() } : null
    }

    user.courses = user.courses || []
    user.courses.push(enrollment)
    await user.save({ session })

    // Update course enrolledStudents for both students AND alumni
    if (isStudentOrAlumni) {
      const studentRecord = {
        studentId: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phone,
        enrollmentTime: enrollment.enrolledAt,
        userType: userType, // Add userType to track if student or alumni
        payment: {
          status: enrollment.payment.status,
          phone: enrollment.payment.phone,
          transactionId: enrollment.payment.transactionId,
          amount: enrollment.payment.amount || null,
          timeOfPayment: enrollment.payment.timeOfPayment || null
        },
        assignmentStatus: enrollment.assignmentStatus || 'PENDING',
        tutor: null
      }

      course.enrolledStudents = course.enrolledStudents || []
      course.enrolledStudents.push(studentRecord)
      await course.save({ session })
    }

    await session.commitTransaction(); session.endSession()

    // After successful commit, if there is a transactionId, mark the Mpesa transaction
    try {
      if (enrollment.payment.transactionId) {
        await MpesaTransaction.findOneAndUpdate(
          { transactionId: String(enrollment.payment.transactionId) },
          {
            purpose: 'course_purchase',
            purposeMeta: { 
              userId: String(userId), 
              courseId: String(courseId),
              userType: userType 
            },
            used: true
          },
          { new: true }
        )
      }
    } catch (txErr) {
      console.warn('Could not mark Mpesa transaction purpose:', txErr)
    }

    // Populate returned enrollment with expected frontend fields
    const populatedEnrollment = {
      ...enrollment,
      courseId: enrollment.courseId,
      name: enrollment.name,
      duration: enrollment.duration,
      durationType: enrollment.durationType,
      payment: enrollment.payment,
      enrolledAt: enrollment.enrolledAt,
      assignmentStatus: enrollment.assignmentStatus,
      tutor: enrollment.tutor,
      curriculum: enrollment.curriculum
    }

    return res.status(201).json({ status: 'success', data: { enrollment: populatedEnrollment } })
  } catch (err) {
    await session.abortTransaction(); session.endSession()
    console.error('Enroll error:', err)
    return res.status(500).json({ status: 'error', message: 'Enrollment failed' })
  }
})

// PUT /users/:id/profile - Update user profile information
router.put('/:id/profile', verifyToken, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const {
      currentLocation,
      nextOfKinName,
      nextOfKinRelationship,
      nextOfKinPhone,
      isActive,
      isPublicProfileEnabled,
      userType
    } = req.body;

    // Verify user owns this profile or is admin
    if (req.userId !== id) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        status: 'error',
        message: 'Forbidden'
      });
    }

    let user = null;
    let model = null;

    // Determine which model to use based on userType
    if (userType === 'student') {
      model = User;
    } else if (userType === 'tutor') {
      model = Tutor;
    } else if (userType === 'alumni') {
      model = Alumni;
    } else {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: 'error',
        message: 'Invalid user type'
      });
    }

    user = await model.findById(id).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Update profile fields
    const updateData = {};

    // Location field (different field names in different models)
    if (currentLocation !== undefined) {
      if (userType === 'student' || userType === 'alumni') {
        updateData.currentLocation = currentLocation;
      } else if (userType === 'tutor') {
        // Tutors might not have location field, adjust as needed
        updateData.currentLocation = currentLocation;
      }
    }

    // Emergency contact fields
    if (nextOfKinName !== undefined) updateData.nextOfKinName = nextOfKinName;
    if (nextOfKinRelationship !== undefined) updateData.nextOfKinRelationship = nextOfKinRelationship;
    if (nextOfKinPhone !== undefined) updateData.nextOfKinPhone = nextOfKinPhone;

    // Account settings
    if (isActive !== undefined) updateData.isActive = isActive;
    if (isPublicProfileEnabled !== undefined) updateData.isPublicProfileEnabled = isPublicProfileEnabled;

    // Update user
    const updatedUser = await model.findByIdAndUpdate(
      id,
      updateData,
      { new: true, session }
    ).select('-password');

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: updatedUser
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Update profile error:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update profile'
    });
  }
});

// POST /users/:id/profile-picture - Upload profile picture
router.post('/:id/profile-picture', verifyToken, upload.single('profilePicture'), async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { userType } = req.body;

    // Verify user owns this profile or is admin
    if (req.userId !== id) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        status: 'error',
        message: 'Forbidden'
      });
    }

    if (!req.file) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: 'error',
        message: 'No image file provided'
      });
    }

    let user = null;
    let model = null;

    // Determine which model to use based on userType
    if (userType === 'student') {
      model = User;
    } else if (userType === 'tutor') {
      model = Tutor;
    } else if (userType === 'alumni') {
      model = Alumni;
    } else {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: 'error',
        message: 'Invalid user type'
      });
    }

    user = await model.findById(id).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Delete old profile picture from Cloudinary if exists
    if (user.profilePicture && user.profilePicture.cloudinaryId) {
      await deleteFromCloudinary(user.profilePicture.cloudinaryId);
    }

    // Upload new picture to Cloudinary
    const uploadResult = await uploadToCloudinary(req.file.buffer);

    // Update user with new profile picture
    const profilePictureData = {
      url: uploadResult.secure_url,
      cloudinaryId: uploadResult.public_id
    };

    const updatedUser = await model.findByIdAndUpdate(
      id,
      { profilePicture: profilePictureData },
      { new: true, session }
    ).select('-password');

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      status: 'success',
      message: 'Profile picture updated successfully',
      data: {
        profilePicture: updatedUser.profilePicture
      }
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Profile picture upload error:', err);

    if (err.message === 'Only image files are allowed') {
      return res.status(400).json({
        status: 'error',
        message: 'Only image files are allowed'
      });
    }

    if (err.message && err.message.includes('File too large')) {
      return res.status(400).json({
        status: 'error',
        message: 'File size must be less than 5MB'
      });
    }

    return res.status(500).json({
      status: 'error',
      message: 'Failed to upload profile picture'
    });
  }
});

// DELETE /users/:id/profile-picture - Remove profile picture
router.delete('/:id/profile-picture', verifyToken, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { userType } = req.body;

    // Verify user owns this profile or is admin
    if (req.userId !== id) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        status: 'error',
        message: 'Forbidden'
      });
    }

    let user = null;
    let model = null;

    // Determine which model to use based on userType
    if (userType === 'student') {
      model = User;
    } else if (userType === 'tutor') {
      model = Tutor;
    } else if (userType === 'alumni') {
      model = Alumni;
    } else {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: 'error',
        message: 'Invalid user type'
      });
    }

    user = await model.findById(id).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Delete profile picture from Cloudinary if exists
    if (user.profilePicture && user.profilePicture.cloudinaryId) {
      await deleteFromCloudinary(user.profilePicture.cloudinaryId);
    }

    // Remove profile picture from user
    const updatedUser = await model.findByIdAndUpdate(
      id,
      {
        profilePicture: {
          url: null,
          cloudinaryId: null
        }
      },
      { new: true, session }
    ).select('-password');

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      status: 'success',
      message: 'Profile picture removed successfully',
      data: {
        profilePicture: updatedUser.profilePicture
      }
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Remove profile picture error:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to remove profile picture'
    });
  }
});

// Add this route to your user routes file
router.get('/dashboard/metrics', verifyToken, async (req, res) => {
  try {
    const { userType } = req.query;
    
    // Determine which model to use based on userType
    let model;
    if (userType === 'student') {
      model = User;
    } else if (userType === 'tutor') {
      model = Tutor;
    } else if (userType === 'alumni') {
      model = Alumni;
    } else {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid user type'
      });
    }

    // Get user data
    const user = await model.findById(req.userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    let metrics = {};

    // Student Dashboard Metrics
    if (userType === 'student') {
      const Group = require('../models/Group');
      const Course = require('../models/Course');
      
      // Get enrolled courses
      const enrolledCourses = user.courses || [];
      
      // Calculate metrics for each course
      const coursesWithMetrics = await Promise.all(
        enrolledCourses.map(async (course) => {
          let completionPercentage = 0;
          let nextLesson = null;
          let isActive = false;
          let totalAssignments = 0;
          let pendingAssignments = 0;
          
          if (course.assignedGroup?.groupId) {
            try {
              const group = await Group.findById(course.assignedGroup.groupId);
              if (group && group.curriculumItems && group.curriculumItems.length > 0) {
                // Calculate completion
                const completedItems = group.curriculumItems.filter(item => 
                  item.isCompleted
                ).length;
                completionPercentage = Math.round((completedItems / group.curriculumItems.length) * 100);
                
                // Find next lesson based on release date
                const now = new Date();
                const upcomingItems = group.curriculumItems
                  .filter(item => {
                    if (!item.releaseDate) return true;
                    const releaseDateTime = new Date(`${item.releaseDate}T${item.releaseTime || '00:00'}`);
                    return releaseDateTime > now && !item.isCompleted;
                  })
                  .sort((a, b) => {
                    const dateA = a.releaseDate ? new Date(`${a.releaseDate}T${a.releaseTime || '00:00'}`) : new Date(0);
                    const dateB = b.releaseDate ? new Date(`${b.releaseDate}T${b.releaseTime || '00:00'}`) : new Date(0);
                    return dateA - dateB;
                  });
                
                if (upcomingItems.length > 0) {
                  nextLesson = {
                    name: upcomingItems[0].name,
                    type: upcomingItems[0].type,
                    releaseDate: upcomingItems[0].releaseDate,
                    releaseTime: upcomingItems[0].releaseTime
                  };
                }
                
                // Count assignments
                totalAssignments = group.curriculumItems.length;
                pendingAssignments = group.curriculumItems.filter(item => !item.isCompleted).length;
                
                isActive = true;
              }
            } catch (err) {
              console.error('Error calculating course metrics:', err);
            }
          }
          
          return {
            ...course.toObject(),
            completionPercentage,
            nextLesson,
            isActive,
            totalAssignments,
            pendingAssignments,
            daysEnrolled: Math.floor((new Date() - new Date(course.enrolledAt)) / (1000 * 60 * 60 * 24))
          };
        })
      );
      
      // Calculate overall metrics
      const activeCourses = coursesWithMetrics.filter(c => c.isActive);
      const completedCourses = coursesWithMetrics.filter(c => c.certificationStatus === 'GRADUATED' || c.certificationStatus === 'CERTIFIED');
      const totalExams = coursesWithMetrics.reduce((sum, course) => sum + (course.exams?.length || 0), 0);
      const averageScore = coursesWithMetrics.length > 0 
        ? coursesWithMetrics.reduce((sum, course) => sum + (course.gpa || 0), 0) / coursesWithMetrics.length
        : 0;
      
      metrics = {
        userType: 'student',
        profile: {
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          admissionNumber: user.admissionNumber || 'N/A',
          profilePicture: user.profilePicture?.url
        },
        summary: {
          totalCourses: enrolledCourses.length,
          activeCourses: activeCourses.length,
          completedCourses: completedCourses.length,
          averageCompletion: activeCourses.length > 0 
            ? Math.round(activeCourses.reduce((sum, course) => sum + course.completionPercentage, 0) / activeCourses.length)
            : 0,
          totalExams,
          averageScore: Math.round(averageScore * 10) / 10,
          daysSinceJoin: Math.floor((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24))
        },
        courses: coursesWithMetrics,
        upcomingDeadlines: coursesWithMetrics
          .flatMap(course => {
            if (!course.assignedGroup?.groupId) return [];
            return course.nextLesson ? [{
              courseName: course.name,
              lesson: course.nextLesson,
              daysLeft: course.nextLesson.releaseDate 
                ? Math.ceil((new Date(`${course.nextLesson.releaseDate}T${course.nextLesson.releaseTime || '00:00'}`) - new Date()) / (1000 * 60 * 60 * 24))
                : null
            }] : [];
          })
          .sort((a, b) => (a.daysLeft || 999) - (b.daysLeft || 999))
          .slice(0, 5)
      };
    }

    // Tutor Dashboard Metrics
    else if (userType === 'tutor') {
      const Group = require('../models/Group');
      
      // Get tutor's groups
      const groups = await Group.find({ tutorId: req.userId });
      
      // Get all students across groups
      const allStudents = groups.flatMap(group => 
        group.students.map(student => ({
          ...student.toObject(),
          groupName: group.name,
          courseName: group.courseName
        }))
      );
      
      // Get unique courses
      const uniqueCourses = [...new Set(groups.map(g => g.courseId.toString()))];
      
      // Calculate metrics
      const totalStudents = allStudents.length;
      const activeStudents = allStudents.filter(s => {
        // Check if student has recent activity (within last 30 days)
        // This would need actual activity tracking - for now using group membership
        return true;
      }).length;
      
      // Calculate pending responses
      let pendingResponses = 0;
      for (const group of groups) {
        for (const item of group.curriculumItems || []) {
          for (const response of item.responses || []) {
            if (!response.tutorRemark && response.studentId.toString() !== req.userId.toString()) {
              pendingResponses++;
            }
          }
        }
      }
      
      // Calculate completion rates for each group
      const groupsWithMetrics = await Promise.all(
        groups.map(async (group) => {
          let totalItems = group.curriculumItems?.length || 0;
          let completedItems = group.curriculumItems?.filter(item => item.isCompleted).length || 0;
          let completionRate = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
          
          // Get recent activity (last 7 days)
          let recentActivity = 0;
          if (group.curriculumItems) {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            
            for (const item of group.curriculumItems) {
              if (item.responses) {
                recentActivity += item.responses.filter(r => 
                  new Date(r.createdAt) > sevenDaysAgo
                ).length;
              }
            }
          }
          
          return {
            id: group._id,
            name: group.name,
            courseName: group.courseName,
            studentCount: group.students?.length || 0,
            totalItems,
            completedItems,
            completionRate,
            recentActivity,
            createdAt: group.createdAt
          };
        })
      );
      
      metrics = {
        userType: 'tutor',
        profile: {
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          phone: user.phone,
          role: user.role,
          profilePicture: user.profilePicture?.url
        },
        summary: {
          totalGroups: groups.length,
          totalStudents,
          activeStudents,
          totalCourses: uniqueCourses.length,
          pendingResponses,
          averageCompletion: groupsWithMetrics.length > 0
            ? Math.round(groupsWithMetrics.reduce((sum, g) => sum + g.completionRate, 0) / groupsWithMetrics.length)
            : 0,
          daysSinceJoin: Math.floor((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24))
        },
        groups: groupsWithMetrics,
        recentActivity: groupsWithMetrics
          .filter(g => g.recentActivity > 0)
          .sort((a, b) => b.recentActivity - a.recentActivity)
          .slice(0, 5),
        certifiedStudents: user.certifiedStudents?.length || 0
      };
    }

    // Alumni Dashboard Metrics
    else if (userType === 'alumni') {
      // Calculate subscription status
      const currentYear = new Date().getFullYear();
      const currentSubscription = user.subscriptionPayments?.find(
        payment => payment.year === currentYear
      );
      
      // Calculate CPD status
      const currentCpd = user.cpdRecords?.find(
        cpd => cpd.year === currentYear
      );
      
      // Calculate practice duration
      let practiceDuration = null;
      if (user.practicingSince) {
        const years = new Date().getFullYear() - new Date(user.practicingSince).getFullYear();
        practiceDuration = years > 0 ? `${years} year${years > 1 ? 's' : ''}` : 'Less than a year';
      }
      
      metrics = {
        userType: 'alumni',
        profile: {
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          qualification: user.qualification || 'N/A',
          course: user.course || 'N/A',
          practiceStatus: user.practiceStatus,
          practicingSince: user.practicingSince,
          currentLocation: user.currentLocation,
          profilePicture: user.profilePicture,
          bio: user.bio || 'No bio available'
        },
        subscription: {
          currentYear,
          status: currentSubscription?.status || 'pending',
          expiryDate: currentSubscription?.expiryDate,
          profileActive: currentSubscription?.profileActive || false,
          needsRenewal: currentSubscription ? 
            new Date(currentSubscription.expiryDate) < new Date() : true
        },
        cpd: {
          currentYear,
          status: currentCpd?.result || 'not_taken',
          dateTaken: currentCpd?.dateTaken,
          score: currentCpd?.score,
          needsRenewal: !currentCpd || currentCpd.year < currentYear
        },
        summary: {
          graduationYear: user.graduationDate ? new Date(user.graduationDate).getFullYear() : null,
          yearsSinceGraduation: user.graduationDate ? 
            new Date().getFullYear() - new Date(user.graduationDate).getFullYear() : null,
          totalExams: user.exams?.length || 0,
          practiceDuration,
          totalCpdRecords: user.cpdRecords?.length || 0,
          subscriptionPayments: user.subscriptionPayments?.length || 0
        },
        exams: user.exams || [],
        cpdHistory: user.cpdRecords?.slice(-5).reverse() || []
      };
    }

    return res.status(200).json({
      status: 'success',
      data: metrics
    });
    
  } catch (err) {
    console.error('Dashboard metrics error:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch dashboard metrics'
    });
  }
});

// POST /users/discussions - Create a new discussion
router.post('/discussions', verifyToken, async (req, res) => {
  try {
    const { title, curriculumId, itemId, initialMessage, attachments, userType } = req.body
    const userId = req.userId

    // Determine which model to use
    let model;
    if (userType === 'student') {
      model = User;
    } else if (userType === 'alumni') {
      model = Alumni;
    } else {
      return res.status(400).json({ status: 'error', message: 'Invalid user type' })
    }

    // Get user to get their name
    const user = await model.findById(userId)
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' })
    }

    const userName = `${user.firstName} ${user.lastName}`

    // Create discussion object
    const discussion = {
      _id: new mongoose.Types.ObjectId(),
      curriculumId,
      itemId,
      title,
      messages: initialMessage ? [
        {
          _id: new mongoose.Types.ObjectId(),
          senderType: 'student',
          senderId: userId,
          senderName: userName,
          message: initialMessage,
          createdAt: new Date()
        }
      ] : [],
      createdAt: new Date(),
      updatedAt: new Date()
    }

    // Add discussion to user
    user.discussions = user.discussions || []
    user.discussions.push(discussion)
    await user.save()

    return res.status(201).json({
      status: 'success',
      data: { discussion }
    })
  } catch (err) {
    console.error('Create discussion error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to create discussion' })
  }
})

// POST /users/discussions/:discussionId/messages - Add message to discussion
router.post('/discussions/:discussionId/messages', verifyToken, async (req, res) => {
  try {
    const { discussionId } = req.params
    const { message, userType, studentId, studentUserType } = req.body
    const userId = req.userId

    if (!message || !message.trim()) {
      return res.status(400).json({ status: 'error', message: 'Message cannot be empty' })
    }

    // If tutor is replying, find the student; otherwise, use the requesting user
    let studentModel;
    let targetUserId;

    if (userType === 'tutor') {
      // Tutor replying - need student info from request body
      if (!studentId || !studentUserType) {
        return res.status(400).json({ status: 'error', message: 'Student info required for tutor reply' })
      }
      targetUserId = studentId;
      studentModel = studentUserType === 'alumni' ? Alumni : User;
    } else {
      // Student adding message
      targetUserId = userId;
      studentModel = userType === 'alumni' ? Alumni : User;
    }

    // Get sender info (either tutor or student)
    let senderModel;
    if (userType === 'student') {
      senderModel = User;
    } else if (userType === 'alumni') {
      senderModel = Alumni;
    } else if (userType === 'tutor') {
      senderModel = Tutor;
    } else {
      return res.status(400).json({ status: 'error', message: 'Invalid user type' })
    }

    const sender = await senderModel.findById(userId)
    if (!sender) {
      return res.status(404).json({ status: 'error', message: 'Sender not found' })
    }

    // Get student to find the discussion
    const student = await studentModel.findById(targetUserId)
    if (!student) {
      return res.status(404).json({ status: 'error', message: 'Student not found' })
    }

    const senderName = `${sender.firstName} ${sender.lastName}`
    const senderType = userType === 'tutor' ? 'tutor' : 'student'

    // Find and update discussion
    const discussion = student.discussions.id(discussionId)
    if (!discussion) {
      return res.status(404).json({ status: 'error', message: 'Discussion not found' })
    }

    discussion.messages.push({
      _id: new mongoose.Types.ObjectId(),
      senderType,
      senderId: userId,
      senderName: senderName,
      message: message.trim(),
      createdAt: new Date()
    })

    discussion.updatedAt = new Date()
    await student.save()

    return res.status(200).json({
      status: 'success',
      data: { discussion }
    })
  } catch (err) {
    console.error('Add message error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to add message' })
  }
})

// PUT /users/:id/curriculum/item-status - mark curriculum item as complete
router.put('/:id/curriculum/item-status', async (req, res) => {
  try {
    const { courseId, itemId, status } = req.body

    if (!courseId || !itemId || !status) {
      return res.status(400).json({ status: 'error', message: 'Missing required fields' })
    }

    // Determine if this is a User or Alumni document
    let user = await User.findById(req.params.id)
    let isAlumni = false

    if (!user) {
      user = await Alumni.findById(req.params.id)
      isAlumni = true
    }

    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' })
    }

    // Find the course
    const course = user.courses?.find(c => String(c.courseId) === String(courseId))
    if (!course) {
      return res.status(404).json({ status: 'error', message: 'Course not found' })
    }

    // Ensure curriculum and itemStatus exist
    if (!course.curriculum) {
      course.curriculum = { curriculumId: null, assignedAt: null, itemStatus: [] }
    }
    if (!course.curriculum.itemStatus) {
      course.curriculum.itemStatus = []
    }

    // Update or add item status
    const existingIndex = course.curriculum.itemStatus.findIndex(
      is => String(is.itemId) === String(itemId)
    )

    if (existingIndex >= 0) {
      // Update existing
      course.curriculum.itemStatus[existingIndex].status = status
      course.curriculum.itemStatus[existingIndex].completedAt = status === 'COMPLETED' ? new Date() : null
    } else {
      // Add new
      course.curriculum.itemStatus.push({
        itemId,
        status,
        completedAt: status === 'COMPLETED' ? new Date() : null
      })
    }

    await user.save()

    return res.status(200).json({
      status: 'success',
      message: 'Item status updated',
      data: { itemStatus: course.curriculum.itemStatus }
    })
  } catch (err) {
    console.error('Update item status error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to update item status' })
  }
})

module.exports = router
