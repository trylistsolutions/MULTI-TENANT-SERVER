const express = require('express');
const jwt = require('jsonwebtoken');
const { connectGoldchildDB } = require('../config/db');
const { getGoldchildAdminUserModel } = require('../models/GoldchildAdminUser');
const {
  createGoldchildCourse,
  deleteGoldchildCourse,
  getAllGoldchildCourses,
  updateGoldchildCourse
} = require('../services/courseService');

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

router.get('/admin', requireAdminAuth, async (req, res) => {
  try {
    const courses = await getAllGoldchildCourses();

    return res.status(200).json({
      status: 'success',
      data: courses
    });
  } catch (error) {
    console.error('Goldchild course list error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch courses.'
    });
  }
});

router.post('/admin', requireAdminAuth, async (req, res) => {
  try {
    const { name, description, duration, durationType, courseFee, status } = req.body;

    if (!name || !description || !duration || !durationType || courseFee === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'Name, description, duration, durationType, and courseFee are required.'
      });
    }

    if (!['hours', 'days', 'weeks', 'months'].includes(durationType)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid durationType. Must be one of: hours, days, weeks, months.'
      });
    }

    if (duration < 1) {
      return res.status(400).json({
        status: 'error',
        message: 'Duration must be at least 1.'
      });
    }

    if (courseFee < 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Course fee cannot be negative.'
      });
    }

    const payload = {
      name: name.trim(),
      description: description.trim(),
      duration: parseInt(duration, 10),
      durationType,
      courseFee: parseFloat(courseFee),
      status: status && ['active', 'inactive'].includes(status) ? status : 'active'
    };

    const createdCourse = await createGoldchildCourse(payload);

    return res.status(201).json({
      status: 'success',
      message: 'Course created successfully.',
      data: createdCourse
    });
  } catch (error) {
    console.error('Goldchild course creation error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to create course.'
    });
  }
});

router.patch('/admin/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, duration, durationType, courseFee, status } = req.body;

    if (!id) {
      return res.status(400).json({
        status: 'error',
        message: 'Course ID is required.'
      });
    }

    const updatePayload = {};

    if (name !== undefined) {
      updatePayload.name = name.trim();
    }

    if (description !== undefined) {
      updatePayload.description = description.trim();
    }

    if (duration !== undefined) {
      if (duration < 1) {
        return res.status(400).json({
          status: 'error',
          message: 'Duration must be at least 1.'
        });
      }
      updatePayload.duration = parseInt(duration, 10);
    }

    if (durationType !== undefined) {
      if (!['hours', 'days', 'weeks', 'months'].includes(durationType)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid durationType. Must be one of: hours, days, weeks, months.'
        });
      }
      updatePayload.durationType = durationType;
    }

    if (courseFee !== undefined) {
      if (courseFee < 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Course fee cannot be negative.'
        });
      }
      updatePayload.courseFee = parseFloat(courseFee);
    }

    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid status. Must be one of: active, inactive.'
        });
      }
      updatePayload.status = status;
    }

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No fields to update.'
      });
    }

    const updatedCourse = await updateGoldchildCourse(id, updatePayload);

    if (!updatedCourse) {
      return res.status(404).json({
        status: 'error',
        message: 'Course not found.'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Course updated successfully.',
      data: updatedCourse
    });
  } catch (error) {
    console.error('Goldchild course update error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update course.'
    });
  }
});

router.delete('/admin/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        status: 'error',
        message: 'Course ID is required.'
      });
    }

    const deletedCourse = await deleteGoldchildCourse(id);

    if (!deletedCourse) {
      return res.status(404).json({
        status: 'error',
        message: 'Course not found.'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Course deleted successfully.'
    });
  } catch (error) {
    console.error('Goldchild course delete error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to delete course.'
    });
  }
});

module.exports = router;
