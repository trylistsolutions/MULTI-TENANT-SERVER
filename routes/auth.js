const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Tutor = require('../models/Tutor');
const Alumni = require('../models/Alumni');
const { generateAdmissionNumber } = require('../utils/admissionGenerator'); // Add this import

const JWT_SECRET = process.env.ZOEZI_JWT_SECRET || 'zoezi_secret';

// Register route for public (students)
router.post('/register', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { firstName, lastName, email, phone, idNumber, dob, password } = req.body;

    if (!firstName || !lastName || !email || !phone || !idNumber || !dob || !password) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ status: 'error', message: 'All fields are required' });
    }

    // Check for existing user
    const existing = await User.findOne({ $or: [{ email }, { phone }] }).session(session);
    if (existing) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ status: 'error', message: 'User with this email or phone already exists' });
    }

    // ADD THIS CHECK FOR EXISTING ALUMNI ACCOUNT
    const existingAlumni = await Alumni.findOne({
      $or: [
        { email: email.toLowerCase().trim() },
        { phone: phone.trim() },
        { idNumber: idNumber.trim() }
      ]
    }).session(session);

    if (existingAlumni) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: 'error',
        message: 'You already have an alumni profile. Please Login.'
      });
    }

    // Generate admission number
    const admissionNumber = await generateAdmissionNumber();

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    // Create user with admission number
    const user = new User({
      firstName,
      lastName,
      email,
      phone,
      idNumber,
      dob,
      password: hashed,
      admissionNumber // Add the generated admission number
    });

    await user.save({ session });

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      status: 'success',
      message: 'Account created successfully',
      data: {
        admissionNumber: user.admissionNumber,
        userId: user._id
      }
    });

  } catch (err) {
    // Abort transaction on error
    await session.abortTransaction();
    session.endSession();

    console.error('Register error:', err);

    // Handle duplicate admission number error (very rare but possible)
    if (err.code === 11000 && err.keyPattern && err.keyPattern.admissionNumber) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to generate unique admission number. Please try again.'
      });
    }

    return res.status(500).json({
      status: 'error',
      message: 'Registration failed. Please try again.'
    });
  }
});

// Login route for all types
router.post('/login', async (req, res) => {
  try {
    const { userType, email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ status: 'error', message: 'Email and password are required' });
    }

    let user = null;
    let model = null;
    if (userType === 'student') {
      model = User;
      user = await model.findOne({ email });
    } else if (userType === 'tutor') {
      model = Tutor;
      user = await model.findOne({ email });
    } else if (userType === 'alumni') {
      model = Alumni;
      user = await model.findOne({ email });
    } else {
      return res.status(400).json({ status: 'error', message: 'Invalid user type' });
    }
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    // For first time login for tutor/alumni, allow phone as password
    let valid = false;
    if (userType === 'student') {
      valid = await bcrypt.compare(password, user.password);
    } else if (userType === 'tutor' || userType === 'alumni') {
      // Try bcrypt comparison first, then fallback to plain phone number
      valid = await bcrypt.compare(password, user.password).catch(() => false) || password === user.phone;
    }
    if (!valid) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }
    // Issue JWT
    const token = jwt.sign({ id: user._id, type: userType }, JWT_SECRET, { expiresIn: '2d' });
    const userWithType = { ...user.toObject(), userType };
    return res.status(200).json({ status: 'success', data: { token, user: userWithType } });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ status: 'error', message: 'Login failed' });
  }
});

// POST /auth/change-password - Change password for all user types
router.post('/change-password', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { currentPassword, newPassword, userType, userId } = req.body;

    if (!currentPassword || !newPassword || !userType || !userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: 'error',
        message: 'All fields are required'
      });
    }

    if (newPassword.length < 6) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 6 characters'
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

    user = await model.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Verify current password
    let isValidCurrentPassword = false;

    if (userType === 'student') {
      // Students always use bcrypt
      isValidCurrentPassword = await bcrypt.compare(currentPassword, user.password);
    } else if (userType === 'tutor' || userType === 'alumni') {
      // For tutors and alumni, check both bcrypt and phone number (for first-time login)
      isValidCurrentPassword = await bcrypt.compare(currentPassword, user.password) || currentPassword === user.phone;
    }

    if (!isValidCurrentPassword) {
      await session.abortTransaction();
      session.endSession();
      return res.status(401).json({
        status: 'error',
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    user.password = hashedNewPassword;
    await user.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      status: 'success',
      message: 'Password changed successfully'
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Change password error:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to change password'
    });
  }
});

// POST /auth/user-data - Get fresh user data by userType and userId
router.post('/user-data', async (req, res) => {
  try {
    const { userId, userType } = req.body;

    if (!userId || !userType) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID and user type are required'
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
      return res.status(400).json({
        status: 'error',
        message: 'Invalid user type'
      });
    }

    // Find user and exclude password field
    user = await model.findById(userId).select('-password');

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    return res.status(200).json({
      status: 'success',
      data: { user }
    });

  } catch (err) {
    console.error('Get user data error:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch user data'
    });
  }
});

module.exports = router;
