const express = require('express');
const jwt = require('jsonwebtoken');
const { connectGoldchildDB } = require('../config/db');
const { getGoldchildAdminUserModel } = require('../models/GoldchildAdminUser');
const {
  getAllGoldchildStudents,
  getGoldchildStudent,
  updateGoldchildStudent,
  getStudentStats,
  getAlumniStats,
  graduateGoldchildStudent,
  getAllGoldchildAlumni
} = require('../services/studentService');
const { getDashboardStats } = require('../services/dashboardService');
const { sendManualAdmissionEmail } = require('../services/emailService');

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
      console.error('Auth error: No token provided');
      return res.status(401).json({
        status: 'error',
        message: 'Missing authorization token'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (tokenError) {
      console.error('Auth error: Invalid token -', tokenError.message);
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired token'
      });
    }

    const adminId = decoded.sub || decoded.id;
    if (!adminId) {
      console.error('Auth error: No admin ID in token', { decoded });
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token format'
      });
    }

    const connection = await connectGoldchildDB();
    const GoldchildAdminUser = getGoldchildAdminUserModel(connection);
    const admin = await GoldchildAdminUser.findById(adminId);

    if (!admin) {
      console.error('Auth error: Admin not found with id', adminId);
      return res.status(401).json({
        status: 'error',
        message: 'Admin not found'
      });
    }

    if (admin.isBlocked) {
      console.error('Auth error: Admin is blocked');
      return res.status(403).json({
        status: 'error',
        message: 'Admin account is blocked'
      });
    }

    req.admin = admin;
    req.connection = connection;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Authentication error'
    });
  }
};

// Get all students with pagination, search, filter
router.get('/admin', requireAdminAuth, async (req, res) => {
  try {
    const result = await getAllGoldchildStudents(req.connection, req.query);
    return res.status(200).json({
      status: 'success',
      data: result.students,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Get students error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve students'
    });
  }
});

// Get student stats - MUST come BEFORE /:id route
router.get('/admin/stats/all', requireAdminAuth, async (req, res) => {
  try {
    const stats = await getStudentStats(req.connection);
    return res.status(200).json({
      status: 'success',
      data: stats
    });
  } catch (error) {
    console.error('Get student stats error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve student stats'
    });
  }
});

// Get comprehensive dashboard statistics
router.get('/admin/dashboard', requireAdminAuth, async (req, res) => {
  try {
    const stats = await getDashboardStats(req.connection);
    return res.status(200).json({
      status: 'success',
      data: stats
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve dashboard statistics'
    });
  }
});

// Get single student by ID
router.get('/admin/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const student = await getGoldchildStudent(req.connection, id);

    if (!student) {
      return res.status(404).json({
        status: 'error',
        message: 'Student not found'
      });
    }

    return res.status(200).json({
      status: 'success',
      data: student
    });
  } catch (error) {
    console.error('Get student error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve student'
    });
  }
});

// Update student
router.patch('/admin/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Prevent certain fields from being updated
    delete updateData.admissionNumber;
    delete updateData.applicationRef;
    delete updateData._id;

    const student = await updateGoldchildStudent(req.connection, id, updateData);

    if (!student) {
      return res.status(404).json({
        status: 'error',
        message: 'Student not found'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Student updated successfully',
      data: student
    });
  } catch (error) {
    console.error('Update student error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update student'
    });
  }
});

// Graduate student - move to alumni
router.post('/admin/:id/graduate', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { graduationNotes = '' } = req.body;

    const alumni = await graduateGoldchildStudent(req.connection, id, graduationNotes);

    return res.status(201).json({
      status: 'success',
      message: 'Student graduated successfully',
      data: {
        alumniId: alumni._id,
        admissionNumber: alumni.admissionNumber,
        graduationDate: alumni.graduationDate
      }
    });
  } catch (error) {
    console.error('Graduate student error:', error.message);

    if (error.message.includes('Student has not completed school fees')) {
      return res.status(400).json({
        status: 'error',
        message: error.message
      });
    }

    if (error.message === 'Student not found') {
      return res.status(404).json({
        status: 'error',
        message: 'Student not found'
      });
    }

    return res.status(500).json({
      status: 'error',
      message: 'Failed to graduate student'
    });
  }
});

// Get all alumni with pagination, search, filter
router.get('/alumni/admin', requireAdminAuth, async (req, res) => {
  try {
    const result = await getAllGoldchildAlumni(req.connection, req.query);
    return res.status(200).json({
      status: 'success',
      data: result.alumni,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Get alumni error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve alumni'
    });
  }
});

// Create student manually (manual admission by admin)
router.post('/admin/manual', requireAdminAuth, async (req, res) => {
  try {
    const GoldchildStudent = require('../models/GoldchildStudent').getGoldchildStudentModel(req.connection);
    
    const studentData = req.body;

    // Validate required fields
    if (!studentData.admissionNumber || !studentData.personalInformation?.firstName || !studentData.personalInformation?.lastName) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: admission number, first name, last name'
      });
    }

    // Create new student
    const student = new GoldchildStudent({
      ...studentData,
      applicationRef: `MANUAL-${Date.now()}` // Generate a manual admission reference
    });

    await student.save();

    // Send manual admission email (non-blocking background task)
    try {
      sendManualAdmissionEmail(
        student.personalInformation?.email,
        `${student.personalInformation?.firstName} ${student.personalInformation?.lastName}`,
        student.admissionNumber,
        student.courseName,
        student.upfrontFee,
        student.courseFee
      ).catch(err => console.error('⚠️ Manual admission email failed (non-blocking):', err));
    } catch (emailError) {
      console.error('⚠️ Failed to queue manual admission email:', emailError);
    }

    return res.status(201).json({
      status: 'success',
      message: 'Student admitted successfully',
      data: student
    });
  } catch (error) {
    if (error.code === 11000) {
      console.error('Admission error: Duplicate admission number');
      return res.status(400).json({
        status: 'error',
        message: 'Admission number already exists'
      });
    }
    console.error('Create student error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to admit student'
    });
  }
});

// Get alumni stats - MUST come BEFORE alumni routes with parameters
router.get('/alumni/stats/all', requireAdminAuth, async (req, res) => {
  try {
    const stats = await getAlumniStats(req.connection);
    return res.status(200).json({
      status: 'success',
      data: stats
    });
  } catch (error) {
    console.error('Get alumni stats error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve alumni stats'
    });
  }
});

module.exports = router;
