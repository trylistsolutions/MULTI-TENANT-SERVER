const express = require('express');
const jwt = require('jsonwebtoken');
const { connectGoldchildDB } = require('../config/db');
const { getGoldchildAdminUserModel } = require('../models/GoldchildAdminUser');
const { getGoldchildStudentApplicationModel } = require('../models/GoldchildStudentApplication');
const { getGoldchildStudentModel } = require('../models/GoldchildStudent');
const {
  createGoldchildStudentApplication,
  deleteGoldchildStudentApplication,
  getAllGoldchildStudentApplications,
  rejectGoldchildStudentApplication
} = require('../services/studentApplicationService');
const { getGoldchildCourseModel } = require('../models/GoldchildCourse');
const {
  sendApplicationConfirmationEmail,
  sendAcceptanceEmail,
  sendRejectionEmail,
  sendAdminNotificationEmail,
  sendManualAdmissionEmail
} = require('../services/emailService');

const router = express.Router();
const JWT_SECRET = process.env.GOLDCHILD_ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'goldchild-admin-secret';

const getAuthToken = (req) => {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.replace('Bearer ', '').trim();
};

const requireAdminAuth = async (req, res, next) => {
  try {
    const token = getAuthToken(req);

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required.'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const connection = await connectGoldchildDB();
    const GoldchildAdminUser = getGoldchildAdminUserModel(connection);
    const user = await GoldchildAdminUser.findById(decoded.sub);

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid authentication token.'
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        status: 'error',
        message: 'This admin account is blocked.'
      });
    }

    req.adminUser = user;
    return next();
  } catch (error) {
    return res.status(401).json({
      status: 'error',
      message: 'Invalid or expired authentication token.'
    });
  }
};

const getMissingFields = (payload) => {
  const missing = [];

  if (!payload?.personalInformation?.firstName) missing.push('personalInformation.firstName');
  if (!payload?.personalInformation?.lastName) missing.push('personalInformation.lastName');
  if (!payload?.personalInformation?.email) missing.push('personalInformation.email');
  if (!payload?.personalInformation?.phoneNumber) missing.push('personalInformation.phoneNumber');
  if (!payload?.personalInformation?.dateOfBirth) missing.push('personalInformation.dateOfBirth');
  if (!payload?.personalInformation?.gender) missing.push('personalInformation.gender');
  if (!payload?.personalInformation?.citizenship) missing.push('personalInformation.citizenship');
  if (!payload?.personalInformation?.idOrPassportNumber) missing.push('personalInformation.idOrPassportNumber');

  if (!payload?.academicInformation?.highestQualification) missing.push('academicInformation.highestQualification');
  if (!payload?.academicInformation?.kcseGradeOrEquivalent) missing.push('academicInformation.kcseGradeOrEquivalent');
  if (!payload?.academicInformation?.course) missing.push('academicInformation.course');
  if (!payload?.academicInformation?.preferredIntakeMonth) missing.push('academicInformation.preferredIntakeMonth');
  if (!payload?.academicInformation?.modeOfTraining) missing.push('academicInformation.modeOfTraining');

  if (!Array.isArray(payload?.discoveryChannels) || payload.discoveryChannels.length === 0) {
    missing.push('discoveryChannels');
  }

  if (!payload?.financialInformation?.feePayerName) missing.push('financialInformation.feePayerName');
  if (!payload?.financialInformation?.feePayerPhoneNumber) missing.push('financialInformation.feePayerPhoneNumber');

  if (!payload?.nextOfKin?.fullName) missing.push('nextOfKin.fullName');
  if (!payload?.nextOfKin?.relationship) missing.push('nextOfKin.relationship');
  if (!payload?.nextOfKin?.phoneNumber) missing.push('nextOfKin.phoneNumber');

  if (payload?.declarations?.rulesAccepted !== true) missing.push('declarations.rulesAccepted');

  return missing;
};

router.post('/student', async (req, res) => {
  try {
    const payload = req.body;
    const missingFields = getMissingFields(payload);

    if (missingFields.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing or invalid required fields.',
        missingFields
      });
    }

    const savedApplication = await createGoldchildStudentApplication(payload);

    // Send application confirmation email to applicant
    try {
      await sendApplicationConfirmationEmail(
        payload.personalInformation.email,
        `${payload.personalInformation.firstName} ${payload.personalInformation.lastName}`,
        savedApplication.applicationNumber
      );
    } catch (emailError) {
      console.error('⚠️ Failed to send confirmation email, but application was saved:', emailError);
    }

    // Send admin notification email (non-blocking background task)
    try {
      sendAdminNotificationEmail(
        `${payload.personalInformation.firstName} ${payload.personalInformation.lastName}`,
        savedApplication.applicationNumber,
        payload.academicInformation?.course?.name || 'Unspecified Course'
      ).catch(err => console.error('⚠️ Admin notification failed (non-blocking):', err));
    } catch (err) {
      console.error('⚠️ Failed to queue admin notification:', err);
    }

    return res.status(201).json({
      status: 'success',
      message: 'Goldchild student application submitted successfully.',
      data: {
        id: savedApplication._id,
        applicationNumber: savedApplication.applicationNumber,
        submittedAt: savedApplication.submittedAt
      }
    });
  } catch (error) {
    console.error('Goldchild student application error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to submit Goldchild student application.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get('/admin', requireAdminAuth, async (req, res) => {
  try {
    const applications = await getAllGoldchildStudentApplications();

    return res.status(200).json({
      status: 'success',
      data: applications
    });
  } catch (error) {
    console.error('Goldchild application list error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch Goldchild applications.'
    });
  }
});

router.patch('/admin/:id/reject', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    const updatedApplication = await rejectGoldchildStudentApplication(id, rejectionReason);

    if (!updatedApplication) {
      return res.status(404).json({
        status: 'error',
        message: 'Application not found.'
      });
    }

    // Send rejection email (non-blocking)
    try {
      await sendRejectionEmail(
        updatedApplication.personalInformation.email,
        `${updatedApplication.personalInformation.firstName} ${updatedApplication.personalInformation.lastName}`,
        rejectionReason
      );
    } catch (emailError) {
      console.error('⚠️ Failed to send rejection email, but application was rejected:', emailError);
    }

    return res.status(200).json({
      status: 'success',
      message: 'Application rejected successfully.',
      data: updatedApplication
    });
  } catch (error) {
    console.error('Goldchild application rejection error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to reject application.'
    });
  }
});

router.delete('/admin/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const deletedApplication = await deleteGoldchildStudentApplication(id);

    if (!deletedApplication) {
      return res.status(404).json({
        status: 'error',
        message: 'Application not found.'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Application deleted successfully.'
    });
  } catch (error) {
    console.error('Goldchild application delete error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to delete application.'
    });
  }
});

// Admit Student - Transfer application to Student model
router.post('/admin/:id/admit', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { admissionNumber, startDate, courseId, upfrontFee, adminNotes } = req.body;

    // Validate required fields
    if (!admissionNumber || !startDate || !courseId || upfrontFee === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: admissionNumber, startDate, courseId, upfrontFee'
      });
    }

    // Fetch application
    const connection = await connectGoldchildDB();
    const GoldchildStudentApplication = getGoldchildStudentApplicationModel(connection);
    const application = await GoldchildStudentApplication.findById(id);

    if (!application) {
      return res.status(404).json({
        status: 'error',
        message: 'Application not found.'
      });
    }

    // Fetch course details from Goldchild DB
    const GoldchildCourse = getGoldchildCourseModel(connection);
    const course = await GoldchildCourse.findById(courseId);

    if (!course) {
      return res.status(404).json({
        status: 'error',
        message: 'Course not found.'
      });
    }

    // Check if admission number already exists
    const GoldchildStudent = getGoldchildStudentModel(connection);
    const existingStudent = await GoldchildStudent.findOne({ admissionNumber });
    if (existingStudent) {
      return res.status(400).json({
        status: 'error',
        message: 'Admission number already in use.'
      });
    }

    // Create GoldchildStudent record from application data + new admission data
    const newStudent = new GoldchildStudent({
      // Admission Details (from admin admit form)
      admissionNumber,
      applicationRef: application.applicationNumber,
      startDate: new Date(startDate),

      // Personal Information (from application)
      personalInformation: {
        firstName: application.personalInformation.firstName,
        lastName: application.personalInformation.lastName,
        email: application.personalInformation.email,
        phoneNumber: application.personalInformation.phoneNumber,
        dateOfBirth: application.personalInformation.dateOfBirth,
        gender: application.personalInformation.gender,
        citizenship: application.personalInformation.citizenship,
        idOrPassportNumber: application.personalInformation.idOrPassportNumber
      },

      // Academic Information (from application)
      academicInformation: {
        highestQualification: application.academicInformation.highestQualification,
        kcseGradeOrEquivalent: application.academicInformation.kcseGradeOrEquivalent,
        course: application.academicInformation.course,
        modeOfTraining: application.academicInformation.modeOfTraining
      },

      // Financial Information (from application)
      financialInformation: {
        feePayerName: application.financialInformation.feePayerName,
        feePayerPhoneNumber: application.financialInformation.feePayerPhoneNumber
      },

      // Next of Kin (from application)
      nextOfKin: {
        fullName: application.nextOfKin.fullName,
        relationship: application.nextOfKin.relationship,
        phoneNumber: application.nextOfKin.phoneNumber
      },

      // Discovery Channels (from application)
      discoveryChannels: application.discoveryChannels || [],

      // Course Selection (from admin admit form - from Goldchild courses DB)
      courseId: course._id.toString(),
      courseName: course.name,
      duration: course.duration,
      durationType: course.durationType,
      courseFee: course.courseFee,

      // Payment Information (from admin admit form)
      upfrontFee,

      // Admin Notes (from admin admit form)
      adminNotes,

      // Status
      status: 'active'
    });

    // Save student
    await newStudent.save();

    // Delete the application after successful student transfer
    await GoldchildStudentApplication.deleteOne({ _id: id });

    // Send acceptance email (non-blocking)
    try {
      await sendAcceptanceEmail(
        newStudent.personalInformation.email,
        `${newStudent.personalInformation.firstName} ${newStudent.personalInformation.lastName}`,
        newStudent.admissionNumber,
        newStudent.courseName,
        newStudent.startDate ? new Date(newStudent.startDate).toLocaleDateString() : null,
        newStudent.upfrontFee,
        newStudent.courseFee
      );
    } catch (emailError) {
      console.error('⚠️ Failed to send acceptance email, but student was admitted:', emailError);
    }

    return res.status(201).json({
      status: 'success',
      message: 'Student admitted successfully.',
      data: {
        studentId: newStudent._id,
        admissionNumber: newStudent.admissionNumber,
        email: newStudent.email
      }
    });
  } catch (error) {
    console.error('Goldchild admit student error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to admit student.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
